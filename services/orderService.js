const stripe = require('stripe')(process.env.STRIPE_SECRET);
const asyncHandler = require('express-async-handler');
const factory = require('./handlerFactory');
const ApiError = require('../utils/apiError');
const productModel = require('../models/productModel');
const OrderModel = require('../models/orderModel');
const userModel = require('../models/userModel');
const cartModel = require('../models/cartModel');

// @desc    create cash order
// @route   POST /api/v1/order/cartId
// @access  Protected/User
exports.createCashOrder = asyncHandler(async(req, res, next)=>{
// app settings
const taxPrice = 0;
const shippingPrice = 0;

// 1) Get cart depend on cartId
const cart = await cartModel.findById(req.params.cartId);
if (!cart) {
  return next(
    new ApiError(`There is no such cart with id ${req.params.cartId}`, 404)
  );
}

// 2) Get order price depend on cart price "Check if coupon apply"
const cartPrice = cart.totalPriceAfterDiscount
? cart.totalPriceAfterDiscount
: cart.totalCartPrice;

const totalOrderPrice = cartPrice + taxPrice + shippingPrice;

// 3) Create order with default paymentMethodType cash
const order = await OrderModel.create({
    user: req.user._id,
    cartItems: cart.cartItems,
    shippingAddress: req.body.shippingAddress,
    totalOrderPrice,
  });

// 4) After creating order, decrement product quantity, increment product sold
if (order) {
    const bulkOption = cart.cartItems.map((item) => ({
      updateOne: {
        filter: { _id: item.product },
        update: { $inc: { quantity: -item.quantity, sold: +item.quantity } },
      },
    }));

await productModel.bulkWrite( bulkOption, {});

// 5) Clear cart depend on cartId
await cartModel.findByIdAndDelete(req.params.cartId);
}

res.status(201).json({ status: 'success', data: order });
});

// filter to get an orders list that belong to only logged in user 
exports.filterOrderForLoggedUser = asyncHandler(async (req, res, next) => {
  if (req.user.role === 'user') req.filterObj = { user: req.user._id };
  next();
});
// @desc    Get all orders
// @route   POST /api/v1/order
// @access  Protected/User-Admin-Manager
exports.findAllOrders = factory.getAll(OrderModel);

// @desc    Get specific order
// @route   POST /api/v1/order
// @access  Protected/User-Admin-Manager
exports.findSpecificOrder = factory.getOne(OrderModel);


// @desc    Update order paid status to paid
// @route   PUT /api/v1/order/:id/pay
// @access  Protected/Admin-Manager
exports.updateOrderToPaid = asyncHandler(async (req, res, next) => {
  const order = await OrderModel.findById(req.params.id);
  if (!order) {
    return next(
      new ApiError(
        `There is no such a order with this id:${req.params.id}`,
        404
      )
    );
  }

  // update order to paid
  order.isPaid = true;
  order.paidAt = Date.now();

  const updatedOrder = await order.save();

  res.status(200).json({ status: 'success', data: updatedOrder });
});

// @desc    Update order delivered status
// @route   PUT /api/v1/order/:id/deliver
// @access  Protected/Admin-Manager
exports.updateOrderToDelivered = asyncHandler(async (req, res, next) => {
  const order = await OrderModel.findById(req.params.id);
  if (!order) {
    return next(
      new ApiError(
        `There is no such a order with this id:${req.params.id}`,
        404
      )
    );
  }

  // update order to paid
  order.isDelivered = true;
  order.deliveredAt = Date.now();

  const updatedOrder = await order.save();

  res.status(200).json({ status: 'success', data: updatedOrder });
});


// @desc    Get checkout session from stripe and send it as response
// @route   GET /api/v1/order/checkout-session/cartId
// @access  Protected/User
exports.checkoutSession = asyncHandler(async (req, res, next) => {
  // app settings
  const taxPrice = 0;
  const shippingPrice = 0;

  // 1) Get cart depend on cartId
  const cart = await cartModel.findById(req.params.cartId);
  if (!cart) {
    return next(
      new ApiError(`There is no such cart with id ${req.params.cartId}`, 404)
    );
  }

  // 2) Get order price depend on cart price "Check if coupon apply"
  const cartPrice = cart.totalPriceAfterDiscount
    ? cart.totalPriceAfterDiscount
    : cart.totalCartPrice;

  const totalOrderPrice = cartPrice + taxPrice + shippingPrice;

  // 3) Create stripe checkout session
  const session = await stripe.checkout.sessions.create({
    line_items: [
      {
        price_data: {
          currency: 'egp',
          product_data: {
            name: req.user.name,
          },
          unit_amount: totalOrderPrice * 100,
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${req.protocol}://${req.get('host')}/order`,
    cancel_url: `${req.protocol}://${req.get('host')}/cart`,
    customer_email: req.user.email,
    client_reference_id: req.params.cartId,
    metadata: req.body.shippingAddress,
  });
  
  // 4) send session to response
  res.status(200).json({ status: 'success', session });
});


const createCardOrder = async (session) => {
  const cartId = session.client_reference_id;
  const shippingAddress = session.metadata;
  const oderPrice = session.amount_total / 100;

  const cart = await cartModel.findById(cartId);
  const user = await userModel.findOne({ email: session.customer_email });

  // 3) Create order with default paymentMethodType card
  const order = await OrderModel.create({
    user: user._id,
    cartItems: cart.cartItems,
    shippingAddress,
    totalOrderPrice: oderPrice,
    isPaid: true,
    paidAt: Date.now(),
    paymentMethodType: 'card',
  });

  // 4) After creating order, decrement product quantity, increment product sold
  if (order) {
    const bulkOption = cart.cartItems.map((item) => ({
      updateOne: {
        filter: { _id: item.product },
        update: { $inc: { quantity: -item.quantity, sold: +item.quantity } },
      },
    }));
    await productModel.bulkWrite(bulkOption, {});

    // 5) Clear cart depend on cartId
    await cartModel.findByIdAndDelete(cartId);
  }
};

// @desc    This webhook will run when stripe payment success paid
// @route   POST /webhook-checkout
// @access  Protected/User
exports.webhookCheckout = asyncHandler(async (req, res, next) => {
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === 'checkout.session.completed') {
     //  Create order
     createCardOrder(event.data.object);
  }

  res.status(200).json({ received: true });
});
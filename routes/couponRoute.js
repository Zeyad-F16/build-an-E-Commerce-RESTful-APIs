const express = require('express');
 
const {
  getCoupon,
  getCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
} = require('../services/couponServices');

const { protrct , allowedTo } = require('../services/authServices'); 

const router = express.Router();

router.use( protrct , allowedTo('admin','manager'));

router.route('/').get(getCoupons).post(createCoupon);

router.route('/:id').get(getCoupon).put(updateCoupon).delete(deleteCoupon);

module.exports = router;
const express = require('express');

const router = express.Router({ mergeParams : true });

const { createSubCategory,
        getSubCategory,
        getSubCategoryId,
        updateSubCategory,
        deleteSubCategory,
        getCategoryIdToBody,
        createFilterObject,
    }
 =require('../services/subCategoryServices');

const {
    createSubCategoryValidator,
    getSubCategoryIdValidator,
    updateSubCategoryValidator,
    deleteSubCategoryValidator
} 
=require('../utils/validators/subCategoryValidator');

const {protrct , allowedTo} = require('../services/authServices');

router.route('/')
.post(protrct ,
    allowedTo('admin','manager') ,
    getCategoryIdToBody , 
    createSubCategoryValidator , 
    createSubCategory )

.get(createFilterObject ,
     getSubCategory)

router.route('/:id')
.get(getSubCategoryIdValidator ,
     getSubCategoryId)

.put(protrct ,
    allowedTo('admin','manager') ,
    updateSubCategoryValidator  , 
    updateSubCategory)

.delete(protrct ,
        allowedTo('admin') ,
        deleteSubCategoryValidator ,
        deleteSubCategory);

module.exports = router;
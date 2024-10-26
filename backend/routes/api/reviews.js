const express = require('express');
const { requireAuth } = require('../../utils/auth');
const { Review, ReviewImage } = require('../../db/models');
const { check } = require('express-validator');
const { handleValidationErrors } = require('../../utils/validation');

const router = express.Router();


// POST /api/spots/:spotId/reviews
router.post('/:spotId/reviews', requireAuth, async (req, res) => {
  const { spotId } = req.params;
  const { review, stars } = req.body;
  const { user } = req; // user object is attached by requireAuth middleware

  try {
    // Check if the spot exists
    const spot = await Spot.findByPk(spotId);
    if (!spot) {
      return res.status(404).json({
        message: "Spot couldn't be found",
      });
    }

    // Check if a review from the current user already exists for this spot
    const existingReview = await Review.findOne({
      where: { spotId, userId: user.id },
    });
    if (existingReview) {
      return res.status(500).json({
        message: 'User already has a review for this spot',
      });
    }

    // Validate the input
    if (!review) {
      return res.status(400).json({
        message: 'Bad Request',
        errors: {
          review: 'Review text is required',
        },
      });
    }
    if (stars < 1 || stars > 5 || !Number.isInteger(stars)) {
      return res.status(400).json({
        message: 'Bad Request',
        errors: {
          stars: 'Stars must be an integer from 1 to 5',
        },
      });
    }

    // Create the new review
    const newReview = await Review.create({
      userId: user.id,
      spotId,
      review,
      stars,
    });

    // Return successful response
    return res.status(201).json(newReview);
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: 'An unexpected error occurred',
    });
  }
});

// **Validation Middleware for Review Updates**
const validateReview = [
  check('review')
    .exists({ checkFalsy: true })
    .withMessage('Review text is required.'),
  check('stars')
    .isInt({ min: 1, max: 5 })
    .withMessage('Stars must be an integer from 1 to 5.'),
  handleValidationErrors,
];

// **Add an Image to a Review (Max 10 Images)**
router.post('/:reviewId/images', requireAuth, async (req, res) => {
  const { reviewId } = req.params;
  const { url } = req.body;

  try {
    const review = await Review.findByPk(reviewId);

    if (!review) {
      return res.status(404).json({ message: "Review couldn't be found" });
    }

    if (review.userId !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const imageCount = await ReviewImage.count({ where: { reviewId } });
    if (imageCount >= 10) {
      return res.status(403).json({
        message: 'Maximum number of images for this resource was reached',
      });
    }

    const newImage = await ReviewImage.create({ reviewId, url });

    return res.status(201).json({
      id: newImage.id,
      url: newImage.url,
    });

  } catch (error) {
    console.error('Add Review Image Error:', error);
    return res.status(500).json({
      message: 'Server Error',
      errors: error.errors || [],
    });
  }
});

// **Update a Review**
router.put('/:reviewId', requireAuth, validateReview, async (req, res) => {
  const { reviewId } = req.params;
  const { review: newReview, stars } = req.body;

  try {
    const review = await Review.findByPk(reviewId);

    if (!review) {
      return res.status(404).json({ message: "Review couldn't be found" });
    }

    if (review.userId !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    await review.update({ review: newReview, stars });

    return res.status(200).json(review);

  } catch (error) {
    console.error('Update Review Error:', error);
    return res.status(500).json({
      message: 'Server Error',
      errors: error.errors || [],
    });
  }
});

// **Delete a Review**
router.delete('/:reviewId', requireAuth, async (req, res) => {
  const { reviewId } = req.params;

  try {
    const review = await Review.findByPk(reviewId);

    if (!review) {
      return res.status(404).json({ message: "Review couldn't be found" });
    }

    if (review.userId !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    await review.destroy();

    return res.status(200).json({ message: 'Successfully deleted' });

  } catch (error) {
    console.error('Delete Review Error:', error);
    return res.status(500).json({
      message: 'Server Error',
      errors: error.errors || [],
    });
  }
});

/**
 * Helper Function to Find and Delete Images
 * Handles deletion for both SpotImage and ReviewImage models.
 */
const findAndDeleteImage = async (model, imageId, ownerKey, req, res) => {
  try {
    const image = await model.findByPk(imageId, {
      include: { 
        model: ownerKey === 'ownerId' ? Spot : Review, 
        attributes: [ownerKey] 
      },
    });

    if (!image) {
      return res.status(404).json({ message: `${model.name} couldn't be found` });
    }

    const ownerId = image[ownerKey === 'ownerId' ? 'Spot' : 'Review'][ownerKey];
    if (ownerId !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    await image.destroy();
    return res.json({ message: 'Successfully deleted' });
    
  } catch (error) {
    console.error('Image Deletion Error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};
/**
 * Delete a Review Image
 * Requires authentication and review ownership verification.
 */
router.delete('/review-images/:imageId', requireAuth, async (req, res) => {
  await findAndDeleteImage(ReviewImage, req.params.imageId, 'userId', req, res);
});

module.exports = router;

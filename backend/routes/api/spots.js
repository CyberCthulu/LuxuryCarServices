const express = require('express');
const { Op, Sequelize } = require('sequelize');
const { Spot, SpotImage, Review, User } = require('../../db/models');
const { requireAuth } = require('../../utils/auth');
const { check } = require('express-validator');
const { handleValidationErrors } = require('../../utils/validation');

const router = express.Router();

// Spot Validation Middleware
const validateSpot = [
  check('address').exists({ checkFalsy: true }).withMessage('Street address is required'),
  check('city').exists({ checkFalsy: true }).withMessage('City is required'),
  check('state').exists({ checkFalsy: true }).withMessage('State is required'),
  check('country').exists({ checkFalsy: true }).withMessage('Country is required'),
  check('lat').isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90'),
  check('lng').isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180'),
  check('name').isLength({ max: 50 }).withMessage('Name must be less than 50 characters'),
  check('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  handleValidationErrors,
];

// Get All Spots
router.get('/', async (req, res) => {
  let { page, size, minLat, maxLat, minLng, maxLng, minPrice, maxPrice } = req.query;

  // Query parameter validation
  const errors = {};
  if (page && (isNaN(page) || page < 1)) errors.page = 'Page must be greater than or equal to 1';
  if (size && (isNaN(size) || size < 1 || size > 20)) errors.size = 'Size must be between 1 and 20';
  if (minLat && isNaN(minLat)) errors.minLat = 'Minimum latitude is invalid';
  if (maxLat && isNaN(maxLat)) errors.maxLat = 'Maximum latitude is invalid';
  if (minLng && isNaN(minLng)) errors.minLng = 'Minimum longitude is invalid';
  if (maxLng && isNaN(maxLng)) errors.maxLng = 'Maximum longitude is invalid';
  if (minPrice && (isNaN(minPrice) || minPrice < 0)) {
    errors.minPrice = 'Minimum price must be greater than or equal to 0';
  }
  if (maxPrice && (isNaN(maxPrice) || maxPrice < 0)) {
    errors.maxPrice = 'Maximum price must be greater than or equal to 0';
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ message: 'Bad Request', errors });
  }

  page = parseInt(page) || 1;
  size = Math.min(parseInt(size) || 20, 20);

  const where = {};
  if (minLat) where.lat = { [Op.gte]: parseFloat(minLat) };
  if (maxLat) where.lat = { [Op.lte]: parseFloat(maxLat) };
  if (minLng) where.lng = { [Op.gte]: parseFloat(minLng) };
  if (maxLng) where.lng = { [Op.lte]: parseFloat(maxLng) };
  if (minPrice) where.price = { [Op.gte]: parseFloat(minPrice) };
  if (maxPrice) where.price = { [Op.lte]: parseFloat(maxPrice) };

  const spots = await Spot.findAll({
    where,
    limit: size,
    offset: (page - 1) * size,
    include: [{ model: SpotImage, where: { preview: true }, required: false }],
  });

  const formattedSpots = spots.map((spot) => ({
    id: spot.id,
    ownerId: spot.ownerId,
    address: spot.address,
    city: spot.city,
    state: spot.state,
    country: spot.country,
    lat: spot.lat,
    lng: spot.lng,
    name: spot.name,
    description: spot.description,
    price: spot.price,
    createdAt: spot.createdAt ? spot.createdAt.toISOString() : null,
    updatedAt: spot.updatedAt ? spot.updatedAt.toISOString() : null,
    previewImage: spot.SpotImages?.[0]?.url || null,
  }));

  res.json({ Spots: formattedSpots, page, size });
});

// Get All Spots Owned by the Current User
router.get('/current', requireAuth, async (req, res) => {
  const { user } = req;

  const spots = await Spot.findAll({
    where: { ownerId: user.id },
    include: [{ model: SpotImage, where: { preview: true }, required: false }],
  });

  const formattedSpots = spots.map(spot => ({
    id: spot.id,
    ownerId: spot.ownerId,
    address: spot.address,
    city: spot.city,
    state: spot.state,
    country: spot.country,
    lat: spot.lat,
    lng: spot.lng,
    name: spot.name,
    description: spot.description,
    price: spot.price,
    createdAt: spot.createdAt ? spot.createdAt.toISOString() : null,
    updatedAt: spot.updatedAt ? spot.updatedAt.toISOString() : null,
    previewImage: spot.SpotImages?.[0]?.url || null,
  }));

  res.json({ Spots: formattedSpots });
});

// Get Spot Details by ID
router.get('/:spotId', async (req, res) => {
  const { spotId } = req.params;

  const spot = await Spot.findByPk(spotId, {
    include: [
      { model: SpotImage, attributes: ['id', 'url', 'preview'] },
      { model: User, as: 'Owner', attributes: ['id', 'firstName', 'lastName'] },
    ],
  });

  if (!spot) {
    return res.status(404).json({ message: "Spot couldn't be found" });
  }

  // Calculate the number of reviews and average star rating
  const numReviews = await Review.count({ where: { spotId } });
  const avgRatingData = await Review.findOne({
    attributes: [[Sequelize.fn('AVG', Sequelize.col('stars')), 'avgRating']],
    where: { spotId },
  });
  const avgStarRating = avgRatingData ? parseFloat(avgRatingData.dataValues.avgRating).toFixed(2) : '0.00';

  // Format the response object
  const formattedSpot = {
    id: spot.id,
    ownerId: spot.ownerId,
    address: spot.address,
    city: spot.city,
    state: spot.state,
    country: spot.country,
    lat: spot.lat,
    lng: spot.lng,
    name: spot.name,
    description: spot.description,
    price: spot.price,
    createdAt: spot.createdAt ? spot.createdAt.toISOString() : null,
    updatedAt: spot.updatedAt ? spot.updatedAt.toISOString() : null,
    numReviews,
    avgStarRating,
    SpotImages: spot.SpotImages,
    Owner: spot.Owner,
  };

  res.json(formattedSpot);
});

// Create a Spot
router.post('/', requireAuth, validateSpot, async (req, res) => {
  const { user } = req;
  const { address, city, state, country, lat, lng, name, description, price } = req.body;

  const spot = await Spot.create({
    ownerId: user.id,
    address,
    city,
    state,
    country,
    lat,
    lng,
    name,
    description,
    price,
  });

  res.status(201).json(spot);
});

// Edit a Spot
router.put('/:spotId', requireAuth, validateSpot, async (req, res) => {
  const { spotId } = req.params;
  const { address, city, state, country, lat, lng, name, description, price } = req.body;

  const spot = await Spot.findByPk(spotId);
  if (!spot) {
    return res.status(404).json({ message: "Spot couldn't be found" });
  }

  if (spot.ownerId !== req.user.id) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  await spot.update({ address, city, state, country, lat, lng, name, description, price });

  res.json(spot);
});

// Delete a Spot
router.delete('/:spotId', requireAuth, async (req, res) => {
  const { spotId } = req.params;

  const spot = await Spot.findByPk(spotId);
  if (!spot) {
    return res.status(404).json({ message: "Spot couldn't be found" });
  }

  if (spot.ownerId !== req.user.id) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  await spot.destroy();
  res.json({ message: 'Successfully deleted' });
});

module.exports = router;

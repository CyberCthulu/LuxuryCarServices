const express = require('express');
const { Op } = require('sequelize'); // Make sure Op is imported
const { requireAuth} = require('../../utils/auth');
const { Booking, Spot, SpotImage } = require('../../db/models');
const { check } = require('express-validator');
const { handleValidationErrors } = require('../../utils/validation');

const router = express.Router();

// **Validation middleware for creating/updating bookings**
const validateBooking = [
  check('startDate').isISO8601().withMessage('Start date is required'),
  check('endDate').isISO8601().withMessage('End date is required'),
  handleValidationErrors
];

//* GET /api/bookings/current
router.get('/current', requireAuth, async (req, res) => {
  const { user } = req;

  try {
    // Find all bookings where the userId matches the current user's ID
    const bookings = await Booking.findAll({
      where: { userId: user.id },
      include: [
        {
          model: Spot,
          attributes: [
            'id',
            'ownerId',
            'address',
            'city',
            'state',
            'country',
            'lat',
            'lng',
            'name',
            'price',
          ],
          include: [
            {
              model: SpotImage, // Correct model name
              attributes: ['url'], // Replace 'url' with the correct field name
              where: { preview: true }, // Fetch only preview images
              required: false, // Allow spots without images
            },
          ],
        },
      ],
    });

    // Format and send the response
    res.status(200).json({ Bookings: bookings });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong while fetching bookings.' });
  }
});


//* PUT /api/bookings/:bookingId
router.put('/:bookingId', requireAuth, validateBooking, async (req, res) => {
  const { user } = req;
  const { bookingId } = req.params;
  const { startDate, endDate } = req.body;

  try {
    // Find the booking to ensure it exists and belongs to the user
    const booking = await Booking.findByPk(bookingId);

    if (!booking) {
      return res.status(404).json({ message: "Booking couldn't be found" });
    }

    // Ensure the booking belongs to the current user
    if (booking.userId !== user.id) {
      return res.status(403).json({ message: "You are not authorized to modify this booking" });
    }

    // Check if the booking's end date has passed
    if (new Date(booking.endDate) < new Date()) {
      return res.status(403).json({ message: "Past bookings can't be modified" });
    }

    // Check for booking conflicts with other bookings for the same spot
    const conflictingBookings = await Booking.findAll({
      where: {
        spotId: booking.spotId,
        id: { [Op.ne]: booking.id }, // Exclude the current booking from the conflict check
        [Op.or]: [
          {
            startDate: { [Op.between]: [startDate, endDate] }
          },
          {
            endDate: { [Op.between]: [startDate, endDate] }
          },
          {
            startDate: { [Op.lte]: startDate },
            endDate: { [Op.gte]: endDate }
          }
        ]
      }
    });

    if (conflictingBookings.length > 0) {
      return res.status(403).json({
        message: "Sorry, this spot is already booked for the specified dates",
        errors: {
          startDate: "Start date conflicts with an existing booking",
          endDate: "End date conflicts with an existing booking"
        }
      });
    }

    // Update the booking dates
    booking.startDate = startDate;
    booking.endDate = endDate;
    await booking.save();

    // Respond with the updated booking details
    res.status(200).json(booking);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong while updating the booking." });
  }
});


//* DELETE /api/bookings/:bookingId
router.delete('/:bookingId', requireAuth, async (req, res) => {
  const { user } = req;
  const { bookingId } = req.params;

  try {
    // Find the booking to ensure it exists
    const booking = await Booking.findByPk(bookingId, {
      include: { model: Spot, attributes: ['ownerId'] }
    });

    if (!booking) {
      return res.status(404).json({ message: "Booking couldn't be found" });
    }

    // Check if the booking belongs to the current user or if the current user is the owner of the spot
    const isAuthorized =
      booking.userId === user.id || booking.Spot.ownerId === user.id;

    if (!isAuthorized) {
      return res.status(403).json({ message: "You are not authorized to delete this booking" });
    }

    // Check if the booking has already started
    if (new Date(booking.startDate) <= new Date()) {
      return res.status(403).json({
        message: "Bookings that have been started can't be deleted"
      });
    }

    // Delete the booking
    await booking.destroy();

    // Respond with a success message
    res.status(200).json({ message: "Successfully deleted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong while deleting the booking." });
  }
});


module.exports = router;
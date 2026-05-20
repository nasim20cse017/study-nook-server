const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());


const uri = process.env.MONGODB_URI;

// Create MongoDB Client
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

// Root Route
app.get("/", (req, res) => {
    res.send("Server is running from StudyNook!");
});

function isOverlap(start1, end1, start2, end2) {
    // Convert "HH:MM" to minutes since midnight for easy comparison
    const toMinutes = (time) => {
        const [h, m] = time.split(":").map(Number);
        return h * 60 + m;
    };
    const s1 = toMinutes(start1);
    const e1 = toMinutes(end1);
    const s2 = toMinutes(start2);
    const e2 = toMinutes(end2);
    return s1 < e2 && s2 < e1;
}

async function run() {
    try {
        // Connect MongoDB
        await client.connect();

        console.log("✅ MongoDB Connected Successfully");

        // Database & Collection
        const db = client.db("studyNook");
        const roomsCollection = db.collection("rooms");
        const bookingCollection = db.collection("bookings");


        // Add Room
        app.post("/rooms", async (req, res) => {
            const roomData = req.body;

            console.log(roomData);

            const result = await roomsCollection.insertOne(
                roomData);

            res.json(result);
        });

        app.get("/rooms", async (req, res) => {
            const result = await roomsCollection.find().toArray();
            res.json(result);
        });

        app.get("/rooms/:id", async (req, res) => {
            const { id } = req.params;

            const result = await roomsCollection.findOne({
                _id: new ObjectId(id),
            });

            res.json(result);
        });

        app.patch("/rooms/:id", async (req, res) => {
            const { id } = req.params;
            const updatedData = req.body;
            console.log(updatedData);

            const result = await roomsCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: updatedData },
            );

            res.json(result);
        });

        app.delete("/rooms/:id", async (req, res) => {
            const { id } = req.params;
            const result = await roomsCollection.deleteOne({
                _id: new ObjectId(id),
            });
            res.json(result);
        });

        // Book a room with conflict check (NO bookingCount increment)
       app.post("/bookings", async (req, res) => {
  const bookingData = req.body;
  const { roomId, date, startTime, endTime } = bookingData;

  if (!roomId || !date || !startTime || !endTime) {
    return res.status(400).json({ message: "Missing required booking fields" });
  }

  try {
    // Conflict check (as before)
    const existingBookings = await bookingCollection.find({
      roomId: roomId,
      date: date,
    }).toArray();

    const hasConflict = existingBookings.some((booking) =>
      isOverlap(startTime, endTime, booking.startTime, booking.endTime)
    );

    if (hasConflict) {
      return res.status(409).json({ message: "Time slot already booked. Please choose another time." });
    }

    // Add status field
    const newBooking = {
      ...bookingData,
      status: "confirmed",
      createdAt: new Date(),
    };

    const result = await bookingCollection.insertOne(newBooking);
    res.status(200).json({ message: "Booking created successfully", bookingId: result.insertedId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});




        app.get("/bookings", async (req, res) => {
            const result = await bookingCollection.find().toArray();
            res.json(result);
        });

app.get("/bookings", async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ message: "userId query parameter is required" });
  }

  try {
    const bookings = await bookingCollection.find({ userId }).toArray();
    res.json(bookings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch bookings" });
  }
});

    app.get("/bookings/:roomId", async (req, res) => {
  const roomId = req.params.roomId;

  const total = await bookingCollection.countDocuments({
    roomId,
  });

  res.send({ total });
});

app.patch("/bookings/:id/cancel", async (req, res) => {
  const { id } = req.params;
  const { userId } = req.body; // send userId in request body for verification

  if (!userId) {
    return res.status(400).json({ message: "userId is required" });
  }

  try {
    const booking = await bookingCollection.findOne({ _id: new ObjectId(id) });

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (booking.userId !== userId) {
      return res.status(403).json({ message: "You are not authorized to cancel this booking" });
    }

    if (booking.status !== "confirmed") {
      return res.status(400).json({ message: "Booking cannot be cancelled (already cancelled or completed)" });
    }

    // Check if booking date is in the future
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const bookingDate = new Date(booking.date);
    if (bookingDate < today) {
      return res.status(400).json({ message: "Cannot cancel a past booking" });
    }

    const result = await bookingCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "cancelled" } }
    );

    if (result.modifiedCount === 1) {
      res.json({ message: "Booking cancelled successfully" });
    } else {
      res.status(500).json({ message: "Failed to cancel booking" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

        // Ping MongoDB
        await client.db("admin").command({ ping: 1 });

        console.log(
            "✅ Pinged your deployment. Successfully connected to MongoDB!"
        );
    } catch (error) {
        console.error("❌ MongoDB Connection Error:", error);
    }
}

run().catch(console.dir);

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
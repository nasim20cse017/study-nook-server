const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");

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

const JWKS = createRemoteJWKSet(new URL(`${process.env.CLIENT_URL}/api/auth/jwks`));

const verifyToken = async (req, res, next) => {
  const authHeader = req?.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);
    console.log(payload);
    next();
  } catch (error) {
    return res.status(403).json({ message: "Forbidden" });
  }
};

async function run() {
    try {
        // Connect MongoDB
        await client.connect();

        console.log("✅ MongoDB Connected Successfully");

        // Database & Collection
        const db = client.db("studyNook");
        const roomsCollection = db.collection("rooms");
        const bookingCollection = db.collection("bookings");

        app.get("/featured", async (req, res) => {
            try {
                const result = await roomsCollection
                    .find({})
                    .sort({ createdAt: -1 }) // Latest rooms first
                    .limit(6) // Only 6 rooms
                    .toArray();

                res.status(200).json(result);

            } catch (error) {
                console.error(error);

                res.status(500).json({
                    success: false,
                    message: "Failed to fetch featured rooms",
                });
            }
        });


        // Add Room
        app.post("/rooms", async (req, res) => {
            const roomData = req.body;

            console.log(roomData);

            const result = await roomsCollection.insertOne(
                roomData);

            res.json(result);
        });

// server.js – add this inside your existing route
app.get("/rooms", async (req, res) => {
  try {
    const { search, amenities, minPrice, maxPrice, floor } = req.query;
    let filter = {};

    // 1. Search by room name (case‑insensitive)
    if (search) {
      filter.roomName = { $regex: search, $options: "i" };
    }

    // 2. Amenities filter (array of selected amenities)
    if (amenities) {
      const amenitiesArray = amenities.split(","); // e.g. "Wi-Fi,Projector"
      filter.amenities = { $in: amenitiesArray };
    }

    // 3. Hourly rate range
    if (minPrice || maxPrice) {
      filter.hourlyRate = {};
      if (minPrice) filter.hourlyRate.$gte = Number(minPrice);
      if (maxPrice) filter.hourlyRate.$lte = Number(maxPrice);
    }

    // 4. Floor filter (exact match)
    if (floor) {
      filter.floor = floor;
    }

    const result = await roomsCollection.find(filter).toArray();
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch rooms" });
  }
});
        app.get("/rooms/:id", verifyToken, async (req, res) => {
            const { id } = req.params;

            const result = await roomsCollection.findOne({
                _id: new ObjectId(id),
            });

            res.json(result);
        });

        app.patch("/rooms/:id", verifyToken, async (req, res) => {
            const { id } = req.params;
            const updatedData = req.body;
            console.log(updatedData);

            const result = await roomsCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: updatedData },
            );

            res.json(result);
        });

        app.delete("/rooms/:id", verifyToken, async (req, res) => {
            const { id } = req.params;
            const result = await roomsCollection.deleteOne({
                _id: new ObjectId(id),
            });
            res.json(result);
        });

        // Book a room with conflict check (NO bookingCount increment)
// Book a room with conflict check using MongoDB $gte/$lte
app.post("/bookings", verifyToken, async (req, res) => {
    const bookingData = req.body;
    const { roomId, date, startTime, endTime } = bookingData;

    // 1. Validate required fields
    if (!roomId || !date || !startTime || !endTime) {
        return res.status(400).json({ message: "Missing required booking fields" });
    }

    // Optional: validate time format (HH:MM) and that startTime < endTime
    if (startTime >= endTime) {
        return res.status(400).json({ message: "startTime must be earlier than endTime" });
    }

    try {
        // 2. Conflict check – find any overlapping booking using MongoDB operators
        // Overlap condition: existing.startTime < new.endTime AND existing.endTime > new.startTime
        const conflictingBooking = await bookingCollection.findOne({
            roomId: roomId,
            date: date,
            startTime: { $lt: endTime },    // existing starts before new ends
            endTime: { $gt: startTime }      // existing ends after new starts
        });

        if (conflictingBooking) {
            return res.status(409).json({
                message: "Time slot already booked. Please choose another time."
            });
        }

        // 3. Create the new booking document
        const newBooking = {
            ...bookingData,
            status: "confirmed",
            createdAt: new Date()
        };

        // 4. Insert into database
        const result = await bookingCollection.insertOne(newBooking);

        res.status(201).json({
            message: "Booking created successfully",
            bookingId: result.insertedId
        });
    } catch (error) {
        console.error("Error creating booking:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});



        app.get("/bookings", async (req, res) => {
            const result = await bookingCollection.find().toArray();
            res.json(result);
        });

        app.get("/bookings", verifyToken, async (req, res) => {
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

        app.patch("/bookings/:id/cancel", verifyToken, async (req, res) => {
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
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");

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

async function run() {
  try {
    // Connect MongoDB
    await client.connect();

    console.log("✅ MongoDB Connected Successfully");

    // Database & Collection
    const db = client.db("studyNook");
    const roomsCollection = db.collection("rooms");


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
const express = require('express');
const mongoose = require('mongoose');
const { ObjectId } = require('mongoose').Types;
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');  


const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3001;

app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect('mongodb+srv://test:test@cluster0.ku7dsnu.mongodb.net/test_ros?retryWrites=true&w=majority', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  appName: 'Cluster0/test_ros'
})
.then(() => {
  console.log('Connected to MongoDB');
  setupSocketIo();
  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
})
.catch((err) => {
  console.error('Error connecting to MongoDB:', err.message);
});

const TractorSchema = new mongoose.Schema({
  speed: Number,
  latitude: Number,
  longitude: Number,
  tractor: Number
}, { collection: 'test1',
     timestamp: true });

const TractorModel = mongoose.model("Tractor", TractorSchema);




app.get("/getDetails", async function(req, res) {
  try {
    const tractor = parseInt(req.query.tractor, 10);
    const date = req.query.date;

    if (isNaN(tractor)) return res.status(400).send('Invalid tractor number');
    if (!date)  return res.status(400).send('Date is required');
    
    console.log("Fetching data...");

    const startOfDay = new Date(date + 'T00:00:00.000+05:30');
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);
    console.log(startOfDay);
    console.log(endOfDay);
    let query = TractorModel.find({
      tractor: tractor,
      timestamp: { $gte: startOfDay.toISOString(), $lt: endOfDay.toISOString() }
    });

    // Handle cursor for pagination
    const cursor = req.query.cursor ? ObjectId(req.query.cursor) : undefined;
    if (cursor)  query = query.where('_id').gt(cursor); 
    const limit = parseInt(req.query.limit, 10) || 1000;
    const results = await query.limit(limit).exec();

    if (results.length === 0) return res.status(404).send('No data found');
    const nextCursor = results[results.length - 1]._id;
    res.json({ data: results, nextCursor: nextCursor });

  } catch (err) {
    console.error('Error fetching data:', err);
    res.status(500).send('Internal Server Error');
  }
});


function setupSocketIo() {
  io.on('connection', (socket) => {
    console.log('Socket.io: connected');

    socket.on('disconnect', () => {
      console.log('Socket.io: disconnected');
    });

    socket.on('watchTractor', async ({ tractor, date }) => {
      try {
        const startOfDay = new Date(`${date}T00:00:00.000+05:30`);
        const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);
        console.log(startOfDay);
        console.log(endOfDay);
        console.log('Fetching data for tractor:', tractor, 'on date:', date);

        const changeStream = TractorModel.watch([{ $match: {
              'fullDocument.tractor': tractor,
              'fullDocument.timestamp': { $gte: startOfDay,$lt: endOfDay }
            }
          }
        ]);

        changeStream.on('change', (change) => {
          console.log('Change stream event:', change);
          if (change.fullDocument) {
              socket.emit('tractorUpdate', change.fullDocument);
          } else {
              console.log('Change without fullDocument:', change);
          }
      });

      socket.on('disconnect', () => {
          changeStream.close();
          console.log('Socket disconnected. Change stream closed.');
      });

      socket.on('stopWatching', () => {
          changeStream.close();
          console.log('Stop watching event received. Change stream closed.');
      });

  } catch (err) {
      console.error('Error setting up change stream:', err);
      socket.emit('error', 'Error setting up change stream');
  }
});
});
}




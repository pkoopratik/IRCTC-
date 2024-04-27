const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken')
const app = express();
const port = process.env.PORT || 3000;
const cookieParser = require('cookie-parser');

app.use(bodyParser.json());
app.use(cookieParser());


// PostgreSQL
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'train',
    password: '12345',
    port: 5432,
});


// Routes
app.post('/api/register', async (req, res) => {

    const result = await pool.query("SELECT * FROM users");
    const { username, password } = req.body;
    try {
        // Check if username already exists
        const existingUser = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ message: 'Username already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await pool.query('INSERT INTO users (username, password) VALUES ($1, $2)', [username, hashedPassword]);

        res.status(201).json({ message: 'User registered successfully' });

    } catch (error) {

        console.error('Error registering user:', error);
        res.status(500).json({ message: 'Internal server error' });
    }

});

app.post('/api/login', async (req, res) => {

    const { username, password } = req.body;

    try {
        const user = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (user.rows.length === 0) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        const hashedPassword = user.rows[0].password;
        const passwordMatch = await bcrypt.compare(password, hashedPassword);
        if (!passwordMatch) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        const token = jwt.sign({ userId: user.rows[0].id }, 'userkey');
        res.cookie('username', username, { maxAge: 900000, httpOnly: true }); 

        res.json({ token });

    } catch (error) {
        console.error('Error logging in user:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.post('/api/trains', async (req, res) => {

    const { source, destination, seats } = req.body;

    try {

        if (req.cookies.username !== "admin") {
            return res.status(403).json({ message: 'Forbidden' });
        }

        await pool.query('INSERT INTO trains (source, destination, seats) VALUES ($1, $2, $3)', [source, destination, seats]);

        res.status(201).json({ message: 'Train added successfully' });

    } catch (error) {
        console.error('Error adding train:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.get('/api/seats', async (req, res) => {

    const { source, destination } = req.body;

    try {
        const trains = await pool.query('SELECT seats FROM trains WHERE source = $1 AND destination = $2', [source, destination]);
        console.log(trains.rows[0].seats)
        const currentTickets = trains.rows[0].seats;

        res.json({
            "total seats ": 100,
            "Available seats": currentTickets,
            "You can book tickests from ": `${100 - currentTickets + 1} to ${100}`
        }
        );
    } catch (error) {
        console.error('Error getting seat availability:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.post('/api/bookings', async (req, res) => {

    const { username, source, destination } = req.body;

    try {
       
        const currentUser = req.cookies.username;
        const user = await pool.query('SELECT * FROM users WHERE username = $1', [currentUser]);

        if (user.rows.length === 0) {
            return res.status(401).json({ message: 'Please login first for booking tickets' });
        }
        console.log(currentUser)

        const trains = await pool.query('SELECT seats FROM trains  WHERE source = $1 AND destination = $2', [source, destination]);
        const currentTickets = trains.rows[0].seats;
        if (currentTickets <= 0) {
            return res.status(403).json({ message: 'No tickets Available sorry , you can try bus' });

        }

        //add details in booking
        await pool.query('INSERT INTO bookings (train_id, seat_number, username) VALUES ($1, $2, $3)', [3, 100 - currentTickets + 1, currentUser]);

        //reduce one seat from train table
        await pool.query('update trains SET seats= $1 where source = $2 AND destination = $3', [currentTickets - 1, source, destination]);

        //get booking Id it will act as PNR
        const bookingId = await pool.query('SELECT id FROM bookings  WHERE seat_number = $1', [100 - currentTickets + 1]);
        const bookingIdNumber = bookingId.rows[0];

        console.log(bookingIdNumber.id);

        res.status(201).json({
            message: 'Seat booked successfully',
            "username": currentUser,
            "source": source,
            "destination": destination,
            "Seat number": 100 - currentTickets + 1,
            "Booking Id (PNR)": bookingIdNumber.id
        });
    } catch (error) {

        console.error('Error booking seat:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.get('/api/bookings/:booking_id', async (req, res) => {

    const bookingId = req.params.booking_id;

    try {
        const booking = await pool.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);

        if (booking.rows.length === 0) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        res.json(booking.rows[0]);
    } catch (error) {
        console.error('Error getting booking details:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
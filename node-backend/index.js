require('dotenv').config();
const express = require('express');
const cors = require('cors')
const axios = require('axios')
const { Pool } = require('pg')

const { KafkaClient, Producer } = require('kafka-node')

const app = express();
app.use(cors());
app.use(express.json());

const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_KEY;
if (!ALPHA_VANTAGE_KEY){
    console.error('ERROR: ALPHA_VANTAGE_KEY is not defined in .env!');
    process.exit(1);
}

const KAFKA_HOST = process.env.KAFKA_HOST;
const KAFKA_TOPIC = process.env.KAFKA_TOPIC;
const ENABLE_KAFKA = process.env.ENABLE_KAFKA;

const PGHOST = process.env.PGHOST
const PGPORT = parseInt(process.env.PGPORT, 10)
const PGUSER = process.env.PGUSER
const PGPASSWORD = process.env.PGPASSWORD
const PGDATABASE = process.env.PGDATABASE

const SERVER_PORT = parseInt(process.env.PORT, 10)

const pool = new Pool({
    user: PGUSER,
    host: PGHOST,
    database: PGDATABASE,
    password: PGPASSWORD,
    port: PGPORT,
});

async function initDb() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS fetch_config (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20) NOT NULL,
        interval_sec INT NOT NULL
        );
    `);
    
    await pool.query(`
        CREATE TABLE IF NOT EXISTS stocks(
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(50),
        price NUMERIC,
        timestamp TIMESTAMP
        );
    `);

    const result = await pool.query('SELECT COUNT(*) FROM fetch_config;');
    if (parseInt(result.rows[0].count, 10) === 0) {
        await pool.query(`
            INSERT INTO fetch_config (symbol, interval_sec)
            VALUES ('AAPL', 30);
        `);
            console.log('[DB] No config found; inserted default (AAPL, 30s).');
    }
    console.log('[DB} Tables ensure. Ready to go.');
}


let producer = null;
let isProducerReady = false;

if (ENABLE_KAFKA) {
    const kafkaClient = new KafkaClient({ kafkaHost: KAFKA_HOST });
    producer = new Producer(kafkaClient);

    producer.on('ready', () => {
        isProducerReady = true;
        console.log('[Kafka] Producer is ready.');
    });
    producer.on('error', (err) => {
        console.error('[Kafka] Producer error:', err);
    });
} else{
    console.log('[Kafka] DISABLED (ENABLE_KAFKA is not "1").');
}


let intervalId = null;

async function scheduleFetchJob() {

    const { rows } = await pool.query(`
        SELECT symbol, interval_sec
        FROM fetch_config
        ORDER BY id
        LIMIT 1
    `);
    if (rows.length === 0) {
        console.warn('[Schedule] No config found in fetch_config.');
    }

    const { symbol, interval_sec } = rows [0];
    console.log(`[Schedule] Setting up fetch for symbol= ${symbol}, interval=${interval_sec}s`);

    if (intervalId){
        clearInterval(intervalId);
        intervalId = null;
    }

    intervalId = setInterval(async () => {
        try{
            await fetchAndStoreStockData(symbol);
        } catch (err) {
            console.error('[FetchJob] Error:', err.message);
        }
    }, interval_sec * 1000);
}

async function fetchAndStoreStockData(symbol) {

    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${symbol}&interval=1min&apikey=${ALPHA_VANTAGE_KEY}`;
    const response = await axios.get(url);
    const data = response.data;

    if (!data['Time Series (1min)']) {
        console.error(`[Fetch] Invalid/rate-limited response for symbol=${symbol}:`, data);
        return;
    }
    
    const timeSeries = data['Time Series (1min)'];
    const latestTimestamp = Object.keys(timeSeries).sort().pop();
    const latestData = timeSeries[latestTimestamp];
    const closePrice = parseFloat(latestData['4. close']);
    console.log(`[Fetch] Symbol=${symbol}, Price=${closePrice}, Time=${latestTimestamp}`);

    await pool.query(`
        INSERT INTO stocks (symbol, price, timestamp)
        VALUES ($1, $2, $3)
        `, [Symbol, closePrice, latestTimestamp]);
    
    if (ENABLE_KAFKA && isProducerReady){
        const message = JSON.stringify({
            symbol,
            price: closePrice,
            timestamp: latestTimestamp
        });
        producer.send([{ topic: KAFKA_TOPIC, messages: [message]}], (err) => {
            if (err) console.error('[Kafka] Message sent:', message);
        });
    }
}

/**
 * GET /api/fetch-config
 * Returns the current config from the DB
 */

app.get('/api/fetch-config', async (requestAnimationFrame, res) => {
    try{
        const { rows } = await pool.query(`
            SELECT symbol, interval_sec
            FROM fetch_config
            ORDER BY id
            LIMIT 1
        `);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'No config found' });
        }
        res.json(rows[0]);
    } catch (error){
        console.error('[GET /api/fetch-config] Error:', error.message);
        res.status(500).json({ error: 'Internat Server Error' });
    }
});

/**
 * POST /api/fetch-config
 * Body: { symbol, interval }
 * Updates config in DB, re-schedules the fetch job
 */

app.post('/api/fetch-config', async (req, res) => {

try{
    const { symbol, interval } = req.body;

    if (!symbol || typeof symbol !== 'string') {
        return res.status(400).json({ error: 'Invalid symbol' });
    }
    const intervalSec = parseInt(interval, 10);
    if (isNaN(intervalSec) || intervalSec <= 0) {
        return res.status(400).json({ error: 'Interval must be a positive integer' });
    }

    await pool.query(`
        UPDATE fetch_config
        SET symbol = $1, interval_sec = $2
        WHERE id = (SELECT id FROM fetch_config ORDER BY id LIMIT 1)
        `, [symbol, intervalSec]);
        
        console.log(`[Config] Updated config to (symbol=${symbol}, interval=${intervalSec}s)`);


        await scheduleFetchJob();
        res.json({ symbol, interval: intervalSec, message: 'Config updated' });
    } catch(error) {
        console.error('[POST /api/fetch-config] Error:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


initDb()
    .then(() => scheduleFetchJob())
    .then(() => {
        app.listen( SERVER_PORT, () => {
            console.log(`Server running at http://localhost:{SERVER_PORT}`);
            console.log(`Kafka: ${ENABLE_KAFKA ? 'ENABLED' : 'DISABLED'}`);
        });
    })
    .catch(err => {
        console.error('[Startup] Error:', err.message);
        process.exit(1);
    });

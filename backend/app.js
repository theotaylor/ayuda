const express = require('express')
const app = express()
const config = require('./utils/config')
const logger = require('./utils/logger')
const mongoose = require('mongoose')

const summaryRouter = require('./controllers/summaries')

mongoose.set('strictQuery', false)

logger.info('connecting to', config.MONGODB_URI)

app.get('/', (request, response) => {
    response.send('Hello World')
})

mongoose.connect(config.MONGODB_URI)
    .then(() => {
        logger.info('connecting to MongoDB')
    })
    .catch((error) => {
        logger.error('error connecting to MongoDB:', error.message)
    })

app.use(express.json())

app.use('/api/summaries', summaryRouter)

module.exports = app
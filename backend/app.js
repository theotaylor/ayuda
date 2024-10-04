const express = require('express')
const app = express()
const cors = require('cors')
const config = require('./utils/config')
const logger = require('./utils/logger')
const mongoose = require('mongoose')

const summaryRouter = require('./controllers/summaries')
const uploadRouter = require('./controllers/upload')

mongoose.set('strictQuery', false)

logger.info('connecting to', config.MONGODB_URI)

mongoose.connect(config.MONGODB_URI)
    .then(() => {
        logger.info('connecting to MongoDB')
    })
    .catch((error) => {
        logger.error('error connecting to MongoDB:', error.message)
    })

app.use(cors())    
app.use(express.static('dist'))
app.use(express.json())

app.use('/api/summaries', summaryRouter)
app.use('/api/upload', uploadRouter)

module.exports = app
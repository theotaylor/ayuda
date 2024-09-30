const summariesRouter = require('express').Router()
const Summary = require('../models/summary')

summariesRouter.post('/', async (request, response) => {
    const body = request.body

    const summary = new Summary({
        content: body.content
    })

    const savedSummary = await summary.save()
    response.status(201).json(savedSummary)
})

summariesRouter.get('/', async (request, response) => {
    const summaries = await Summary.find({})
    response.json(summaries)
})

module.exports = summariesRouter

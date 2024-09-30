const mongoose = require('mongoose')

const summarySchema = new mongoose.Schema({
    content: String
})

summarySchema.set('toJSON', {
    transform: (document, returnedObject) => {
      returnedObject.id = returnedObject._id.toString()
      delete returnedObject._id
      delete returnedObject.__v
    }
})

module.exports = mongoose.model('Summary', summarySchema)
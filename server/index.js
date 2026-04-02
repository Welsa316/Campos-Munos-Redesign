import dotenv from 'dotenv'
if (process.env.NODE_ENV !== 'production') dotenv.config()

import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import authRoutes from './routes/auth.js'
import submissionRoutes from './routes/submissions.js'

const app = express()
const PORT = process.env.PORT || 3000

app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
}))
app.use(cookieParser())
app.use(express.json({ limit: '100kb' }))

app.use('/api/auth', authRoutes)
app.use('/api/submissions', submissionRoutes)

app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

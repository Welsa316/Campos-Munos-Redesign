import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env') })

import bcrypt from 'bcrypt'
import getPool from './pool.js'

async function seed() {
  const pool = getPool()
  const client = await pool.connect()
  try {
    // Seed admin user
    const email = process.env.ADMIN_EMAIL || 'admin@camulaw.com'
    const password = process.env.ADMIN_INITIAL_PASSWORD || 'changeme'
    const hash = await bcrypt.hash(password, 12)

    await client.query(
      `INSERT INTO admin_users (email, password_hash)
       VALUES ($1, $2)
       ON CONFLICT (email) DO NOTHING`,
      [email, hash]
    )
    console.log(`\nAdmin account seeded:`)
    console.log(`  Email:    ${email}`)
    console.log(`  Password: ${password}\n`)

    // Seed submissions spread across last 3 days
    const now = Date.now()
    const hour = 3600000
    const day = 24 * hour

    const submissions = [
      { firstName: 'Maria', lastName: 'Garcia', email: 'maria.garcia@gmail.com', phone: '504-555-1234', message: 'Buenas tardes. Necesito informacion sobre el proceso de asilo para mi familia. Llegamos de Guatemala hace 6 meses y no sabemos cuales son los siguientes pasos. Agradeceria mucho una consulta.', is_read: true, ago: 2.5 * day },
      { firstName: 'Carlos', lastName: 'Rodriguez', email: 'carlos.r@hotmail.com', phone: '504-555-2345', message: 'Hello, I am interested in learning about the DACA renewal process. My permit expires in 3 months and I want to make sure I file everything on time. Can we schedule a consultation?', is_read: true, ago: 2 * day },
      { firstName: 'Ana', lastName: 'Martinez', email: 'ana.martinez@yahoo.com', phone: '504-555-3456', message: 'Hola, mi esposo es ciudadano americano y queremos empezar el proceso de la green card para mi. Cuanto tiempo toma el proceso y cuales son los costos? Gracias.', is_read: true, ago: 1.8 * day },
      { firstName: 'Roberto', lastName: 'Sanchez', email: 'roberto.s@gmail.com', phone: '504-555-4567', message: 'I received a notice to appear in immigration court next month. I need legal representation urgently. Please let me know your availability as soon as possible.', is_read: false, ago: 1.2 * day },
      { firstName: 'Laura', lastName: 'Hernandez', email: 'laura.h@outlook.com', phone: '504-555-5678', message: 'Buenas noches. Tengo una pregunta sobre la visa U para victimas de crimen. Fui victima de un robo y la policia hizo un reporte. Califico para esta visa?', is_read: false, ago: 1 * day },
      { firstName: 'Jose', lastName: 'Ramirez', email: 'jose.ramirez@gmail.com', phone: '504-555-6789', message: 'Hi, I am a business owner and I want to sponsor an employee for a work visa. Can you help me understand the H-1B process and what documentation I need to prepare?', is_read: false, ago: 18 * hour },
      { firstName: 'Diana', lastName: 'Flores', email: 'diana.f@icloud.com', phone: '504-555-7890', message: 'Necesito ayuda con la peticion de mis padres. Soy ciudadana americana y quiero traer a mis padres de Honduras. Cuanto tiempo toma este proceso actualmente?', is_read: false, ago: 8 * hour },
      { firstName: 'Miguel', lastName: 'Torres', email: 'miguel.t@gmail.com', phone: '504-555-8901', message: 'Good morning. I have TPS and heard there might be changes to the program soon. I want to explore other options for permanent residency. Can we discuss my case?', is_read: false, ago: 3 * hour },
      { firstName: 'Sofia', lastName: 'Mendez', email: 'sofia.mendez@gmail.com', phone: '504-555-9012', message: 'Hola, quisiera saber si ofrecen planes de pago para sus servicios legales. Necesito ayuda con mi caso de inmigracion pero mi situacion economica es dificil en este momento.', is_read: false, ago: 1 * hour },
    ]

    for (const sub of submissions) {
      const ts = new Date(now - sub.ago).toISOString()
      await client.query(
        `INSERT INTO submissions (first_name, last_name, email, phone, message, is_read, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [sub.firstName, sub.lastName, sub.email, sub.phone, sub.message, sub.is_read, ts]
      )
    }
    console.log(`Seeded ${submissions.length} submissions.`)

    // Seed replies for read submissions
    const readSubmissions = await client.query(
      `SELECT id, first_name, last_name, created_at FROM submissions WHERE is_read = true ORDER BY created_at ASC`
    )

    if (readSubmissions.rows.length >= 2) {
      const sub1 = readSubmissions.rows[0]
      const sub1Time = new Date(new Date(sub1.created_at).getTime() + 2 * hour).toISOString()
      await client.query(
        `INSERT INTO replies (submission_id, body, sent_at) VALUES ($1, $2, $3)`,
        [sub1.id, 'Buenas tardes Maria. Gracias por contactarnos. Estaremos encantados de ayudarle con su caso de asilo. Por favor llame a nuestra oficina al 504-910-6508 para programar una consulta inicial. Tenemos disponibilidad esta semana.', sub1Time]
      )

      const sub2 = readSubmissions.rows[1]
      const sub2Time = new Date(new Date(sub2.created_at).getTime() + 3 * hour).toISOString()
      await client.query(
        `INSERT INTO replies (submission_id, body, sent_at) VALUES ($1, $2, $3)`,
        [sub2.id, 'Hi Carlos, thank you for reaching out. DACA renewals should be filed 120-150 days before expiration, so you are in a good window. We can help you with the paperwork. Please schedule a consultation through our office at 504-910-6508 or visit our payment page to secure your appointment.', sub2Time]
      )
    }

    if (readSubmissions.rows.length >= 3) {
      const sub3 = readSubmissions.rows[2]
      const sub3Time = new Date(new Date(sub3.created_at).getTime() + 4 * hour).toISOString()
      await client.query(
        `INSERT INTO replies (submission_id, body, sent_at) VALUES ($1, $2, $3)`,
        [sub3.id, 'Hola Ana, gracias por su mensaje. El proceso de green card a traves de esposo ciudadano generalmente toma entre 12-18 meses. Le invitamos a una consulta para revisar su caso especifico y darle un estimado mas preciso de costos y tiempos.', sub3Time]
      )
    }

    console.log('Seeded replies for read submissions.')
    console.log('\nSeed complete!')
  } finally {
    client.release()
    await pool.end()
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})

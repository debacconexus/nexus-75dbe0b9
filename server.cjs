const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database initialization
async function initializeDatabase() {
  try {
    // Create districts table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS districts (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        region VARCHAR(255),
        country VARCHAR(255) NOT NULL,
        population INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create field_workers table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS field_workers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE,
        phone VARCHAR(50),
        district_id INTEGER REFERENCES districts(id),
        role VARCHAR(100) DEFAULT 'field_worker',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create maternal_deaths table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS maternal_deaths (
        id SERIAL PRIMARY KEY,
        case_number VARCHAR(100) UNIQUE NOT NULL,
        deceased_name VARCHAR(255) NOT NULL,
        age INTEGER,
        date_of_death DATE NOT NULL,
        place_of_death VARCHAR(255),
        district_id INTEGER REFERENCES districts(id),
        cause_of_death TEXT,
        circumstances TEXT,
        preventable BOOLEAN DEFAULT false,
        preventable_factors TEXT,
        anc_visits INTEGER DEFAULT 0,
        delivery_location VARCHAR(255),
        skilled_attendant BOOLEAN DEFAULT false,
        complications TEXT,
        time_to_facility INTEGER, -- minutes
        reported_by INTEGER REFERENCES field_workers(id),
        investigation_status VARCHAR(100) DEFAULT 'pending',
        notes TEXT,
        cross_border BOOLEAN DEFAULT false,
        reporting_country VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create death_reviews table for maternal death review committee findings
    await pool.query(`
      CREATE TABLE IF NOT EXISTS death_reviews (
        id SERIAL PRIMARY KEY,
        death_id INTEGER REFERENCES maternal_deaths(id),
        review_date DATE,
        committee_findings TEXT,
        recommendations TEXT,
        preventability_score INTEGER CHECK (preventability_score >= 1 AND preventability_score <= 5),
        system_factors TEXT,
        care_factors TEXT,
        patient_factors TEXT,
        reviewed_by VARCHAR(255),
        status VARCHAR(100) DEFAULT 'completed',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create contacts table for UN reporting contacts
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        organization VARCHAR(255),
        role VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(50),
        country VARCHAR(255),
        contact_type VARCHAR(100) DEFAULT 'un_reporting',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create audit_logs table for tracking changes
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        table_name VARCHAR(100),
        record_id INTEGER,
        action VARCHAR(50),
        old_values JSONB,
        new_values JSONB,
        user_id INTEGER REFERENCES field_workers(id),
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Database tables initialized successfully');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
}

// Initialize database on startup
initializeDatabase();

// API Routes

// Districts CRUD
app.get('/api/districts', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM districts ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/districts', async (req, res) => {
  try {
    const { name, region, country, population } = req.body;
    const result = await pool.query(
      'INSERT INTO districts (name, region, country, population) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, region, country, population]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/districts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, region, country, population } = req.body;
    const result = await pool.query(
      'UPDATE districts SET name = $1, region = $2, country = $3, population = $4 WHERE id = $5 RETURNING *',
      [name, region, country, population, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/districts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM districts WHERE id = $1', [id]);
    res.json({ message: 'District deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Field Workers CRUD
app.get('/api/field-workers', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT fw.*, d.name as district_name 
      FROM field_workers fw 
      LEFT JOIN districts d ON fw.district_id = d.id 
      ORDER BY fw.name
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/field-workers', async (req, res) => {
  try {
    const { name, email, phone, district_id, role } = req.body;
    const result = await pool.query(
      'INSERT INTO field_workers (name, email, phone, district_id, role) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, email, phone, district_id, role]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/field-workers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, district_id, role } = req.body;
    const result = await pool.query(
      'UPDATE field_workers SET name = $1, email = $2, phone = $3, district_id = $4, role = $5 WHERE id = $6 RETURNING *',
      [name, email, phone, district_id, role, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/field-workers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM field_workers WHERE id = $1', [id]);
    res.json({ message: 'Field worker deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Maternal Deaths CRUD
app.get('/api/maternal-deaths', async (req, res) => {
  try {
    const { district_id, preventable, investigation_status } = req.query;
    let query = `
      SELECT md.*, d.name as district_name, fw.name as reported_by_name
      FROM maternal_deaths md
      LEFT JOIN districts d ON md.district_id = d.id
      LEFT JOIN field_workers fw ON md.reported_by = fw.id
      WHERE 1=1
    `;
    const params = [];
    
    if (district_id) {
      params.push(district_id);
      query += ` AND md.district_id = $${params.length}`;
    }
    
    if (preventable !== undefined) {
      params.push(preventable === 'true');
      query += ` AND md.preventable = $${params.length}`;
    }
    
    if (investigation_status) {
      params.push(investigation_status);
      query += ` AND md.investigation_status = $${params.length}`;
    }
    
    query += ' ORDER BY md.date_of_death DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/maternal-deaths/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT md.*, d.name as district_name, fw.name as reported_by_name
      FROM maternal_deaths md
      LEFT JOIN districts d ON md.district_id = d.id
      LEFT JOIN field_workers fw ON md.reported_by = fw.id
      WHERE md.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Maternal death case not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/maternal-deaths', async (req, res) => {
  try {
    const {
      case_number, deceased_name, age, date_of_death, place_of_death,
      district_id, cause_of_death, circumstances, preventable,
      preventable_factors, anc_visits, delivery_location,
      skilled_attendant, complications, time_to_facility,
      reported_by, investigation_status, notes, cross_border,
      reporting_country
    } = req.body;
    
    const result = await pool.query(`
      INSERT INTO maternal_deaths (
        case_number, deceased_name, age, date_of_death, place_of_death,
        district_id, cause_of_death, circumstances, preventable,
        preventable_factors, anc_visits, delivery_location,
        skilled_attendant, complications, time_to_facility,
        reported_by, investigation_status, notes, cross_border,
        reporting_country
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *
    `, [
      case_number, deceased_name, age, date_of_death, place_of_death,
      district_id, cause_of_death, circumstances, preventable,
      preventable_factors, anc_visits, delivery_location,
      skilled_attendant, complications, time_to_facility,
      reported_by, investigation_status, notes, cross_border,
      reporting_country
    ]);
    
    // Add [IGM-GOVERNED] tag to notes if not present
    const noteText = `[IGM-GOVERNED] Case documented by field worker. ${notes || ''}`;
    await pool.query('UPDATE maternal_deaths SET notes = $1 WHERE id = $2', [noteText, result.rows[0].id]);
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/maternal-deaths/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      case_number, deceased_name, age, date_of_death, place_of_death,
      district_id, cause_of_death, circumstances, preventable,
      preventable_factors, anc_visits, delivery_location,
      skilled_attendant, complications, time_to_facility,
      investigation_status, notes, cross_border, reporting_country
    } = req.body;
    
    const noteText = notes ? `[IGM-GOVERNED] Updated case information. ${notes}` : notes;
    
    const result = await pool.query(`
      UPDATE maternal_deaths SET
        case_number = $1, deceased_name = $2, age = $3, date_of_death = $4,
        place_of_death = $5, district_id = $6, cause_of_death = $7,
        circumstances = $8, preventable = $9, preventable_factors = $10,
        anc_visits = $11, delivery_location = $12, skilled_attendant = $13,
        complications = $14, time_to_facility = $15, investigation_status = $16,
        notes = $17, cross_border = $18, reporting_country = $19,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $20 RETURNING *
    `, [
      case_number, deceased_name, age, date_of_death, place_of_death,
      district_id, cause_of_death, circumstances, preventable,
      preventable_factors, anc_visits, delivery_location,
      skilled_attendant, complications, time_to_facility,
      investigation_status, noteText, cross_border, reporting_country, id
    ]);
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/maternal-deaths/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM maternal_deaths WHERE id = $1', [id]);
    res.json({ message: 'Maternal death case deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Death Reviews CRUD
app.get('/api/death-reviews', async (req, res) => {
  try {
    const { death_id } = req.query;
    let query = `
      SELECT dr.*, md.case_number, md.deceased_name
      FROM death_reviews dr
      LEFT JOIN maternal_deaths md ON dr.death_id = md.id
      WHERE 1=1
    `;
    const params = [];
    
    if (death_id) {
      params.push(death_id);
      query += ` AND dr.death_id = $${params.length}`;
    }
    
    query += ' ORDER BY dr.review_date DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/death-reviews', async (req, res) => {
  try {
    const {
      death_id, review_date, committee_findings, recommendations,
      preventability_score, system_factors, care_factors,
      patient_factors, reviewed_by, status, notes
    } = req.body;
    
    const noteText = `[IGM-GOVERNED] Maternal death review completed. ${notes || ''}`;
    
    const result = await pool.query(`
      INSERT INTO death_reviews (
        death_id, review_date, committee_findings, recommendations,
        preventability_score, system_factors, care_factors,
        patient_factors, reviewed_by, status, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *
    `, [
      death_id, review_date, committee_findings, recommendations,
      preventability_score, system_factors, care_factors,
      patient_factors, reviewed_by, status, noteText
    ]);
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/death-reviews/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      review_date, committee_findings, recommendations,
      preventability_score, system_factors, care_factors,
      patient_factors, reviewed_by, status, notes
    } = req.body;
    
    const noteText = notes ? `[IGM-GOVERNED] Review updated. ${notes}` : notes;
    
    const result = await pool.query(`
      UPDATE death_reviews SET
        review_date = $1, committee_findings = $2, recommendations = $3,
        preventability_score = $4, system_factors = $5, care_factors = $6,
        patient_factors = $7, reviewed_by = $8, status = $9, notes = $10
      WHERE id = $11 RETURNING *
    `, [
      review_date, committee_findings, recommendations,
      preventability_score, system_factors, care_factors,
      patient_factors, reviewed_by, status, noteText, id
    ]);
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/death-reviews/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM death_reviews WHERE id = $1', [id]);
    res.json({ message: 'Death review deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Contacts API (for UN reporting contacts)
app.post('/api/contacts', async (req, res) => {
  try {
    const { name, organization, role, email, phone, country, contact_type, notes } = req.body;
    
    const noteText = notes ? `[IGM-GOVERNED] UN reporting contact added. ${notes}` : `[IGM-GOVERNED] UN reporting contact added.`;
    
    const result = await pool.query(`
      INSERT INTO contacts (name, organization, role, email, phone, country, contact_type, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
    `, [name, organization, role, email, phone, country, contact_type || 'un_reporting', noteText]);
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/contacts', async (req, res) => {
  try {
    const { contact_type } = req.query;
    let query = 'SELECT * FROM contacts WHERE 1=1';
    const params = [];
    
    if (contact_type) {
      params.push(contact_type);
      query += ` AND contact_type = $${params.length}`;
    }
    
    query += ' ORDER BY organization, name';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/contacts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, organization, role, email, phone, country, contact_type, notes } = req.body;
    
    const noteText = notes ? `[IGM-GOVERNED] Contact information updated. ${notes}` : notes;
    
    const result = await pool.query(`
      UPDATE contacts SET
        name = $1, organization = $2, role = $3, email = $4,
        phone = $5, country = $6, contact_type = $7, notes = $8
      WHERE id = $9 RETURNING *
    `, [name, organization, role, email, phone, country, contact_type, noteText, id]);
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/contacts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM contacts WHERE id = $1', [id]);
    res.json({ message: 'Contact deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Statistics API for dashboards and reports
app.get('/api/stats', async (req, res) => {
  try {
    // Basic statistics
    const totalDeaths = await pool.query('SELECT COUNT(*) as count FROM maternal_deaths');
    const preventableDeaths = await pool.query('SELECT COUNT(*) as count FROM maternal_deaths WHERE preventable = true');
    const pendingInvestigations = await pool.query('SELECT COUNT(*) as count FROM maternal_deaths WHERE investigation_status = $1', ['pending']);
    const crossBorderCases = await pool.query('SELECT COUNT(*) as count FROM maternal_deaths WHERE cross_border = true');
    
    // Deaths by district
    const deathsByDistrict = await pool.query(`
      SELECT d.name, COUNT(md.id) as deaths
      FROM districts d
      LEFT JOIN maternal_deaths md ON d.id = md.district_id
      GROUP BY d.id, d.name
      ORDER BY deaths DESC
    `);
    
    // Deaths by month (last 12 months)
    const deathsByMonth = await pool.query(`
      SELECT 
        DATE_TRUNC('month', date_of_death) as month,
        COUNT(*) as deaths
      FROM maternal_deaths
      WHERE date_of_death >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', date_of_death)
      ORDER BY month
    `);
    
    // Preventability analysis
    const preventabilityStats = await pool.query(`
      SELECT 
        AVG(preventability_score) as avg_score,
        COUNT(*) as total_reviews
      FROM death_reviews
      WHERE preventability_score IS NOT NULL
    `);
    
    // ANC visits analysis
    const ancAnalysis = await pool.query(`
      SELECT 
        CASE 
          WHEN anc_visits = 0 THEN 'No ANC'
          WHEN anc_visits BETWEEN 1 AND 3 THEN '1-3 visits'
          WHEN anc_visits >= 4 THEN '4+ visits'
          ELSE 'Unknown'
});

}

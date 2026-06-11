/**
 * SLBFE Database Seed Script
 * Run: node seed.js
 *
 * Demo accounts:
 *   Officer:  officer@slbfe.gov.lk  / Officer@1234
 *   Company:  hr@globalcompany.com  / Company@1234
 *   Citizens: kamal@example.com, nimal@example.com, saman@example.com  / Citizen@1234
 */
const bcrypt = require('bcryptjs');
const db = require('./src/database');

async function seed() {
  console.log('\n🌱 Seeding SLBFE database...\n');

  await db.init();

  const h = pw => bcrypt.hash(pw, 12);

  // Clear existing data
  await db.exec(`
    DELETE FROM complaints;
    DELETE FROM locations;
    DELETE FROM documents;
    DELETE FROM contacts;
    DELETE FROM qualifications;
    DELETE FROM users;
  `);
  console.log('  ✓ Cleared existing data');

  // Officer
  await db.run(
    `INSERT INTO users (nid,name,age,address,email,role,affiliation,password_hash,is_verified)
     VALUES (?,?,?,?,?,?,?,?,1)`,
    ['OFF001','Priya Silva',35,'SLBFE HQ, Battaramulla, Colombo','officer@slbfe.gov.lk','officer','SLBFE', await h('Officer@1234')]
  );
  console.log('  ✓ Officer:  officer@slbfe.gov.lk  /  Officer@1234');

  // Company
  await db.run(
    `INSERT INTO users (nid,name,age,address,email,role,affiliation,password_hash,is_verified)
     VALUES (?,?,?,?,?,?,?,?,1)`,
    ['COM001','Global Corp HR',40,'Dubai, UAE','hr@globalcompany.com','company','Global Corporation Ltd.', await h('Company@1234')]
  );
  console.log('  ✓ Company:  hr@globalcompany.com   /  Company@1234');

  // Citizens
  const citizens = [
    {
      nid:'200012345678', name:'Kamal Perera', age:28, address:'45 Galle Road, Colombo 03',
      profession:'Software Engineer', email:'kamal@example.com', lat:6.9271, lng:79.8612,
      quals:[
        ['BSc','University of Moratuwa','Computer Science',2020],
        ['Diploma','NIBM','Information Technology',2018]
      ],
      contacts:[['Kumari Perera','Mother','+94771234567','kumari@example.com','45 Galle Road, Colombo']],
      loc:['Saudi Arabia','Riyadh','Tech Solutions LLC',24.7136,46.6753]
    },
    {
      nid:'199812345679', name:'Nimal Fernando', age:30, address:'12 Temple Road, Kandy',
      profession:'Civil Engineer', email:'nimal@example.com', lat:7.2906, lng:80.6337,
      quals:[
        ['BSc Eng','University of Peradeniya','Civil Engineering',2019],
        ['MSc','University of Moratuwa','Structural Engineering',2022]
      ],
      contacts:[['Sunil Fernando','Father','+94712345678',null,'12 Temple Road, Kandy']],
      loc:['Qatar','Doha','Al Balagh Group',25.2854,51.5310]
    },
    {
      nid:'200198765432', name:'Saman Jayawardena', age:25, address:'78 Main Street, Galle',
      profession:'Nurse', email:'saman@example.com', lat:6.0535, lng:80.2210,
      quals:[
        ['Diploma in Nursing','Galle Teaching Hospital','Healthcare',2021],
        ['Certificate','Sri Lanka Nursing Council','General Nursing',2020]
      ],
      contacts:[['Mala Jayawardena','Sister','+94753456789','mala@example.com','78 Main Street, Galle']],
      loc: null
    }
  ];

  for (const c of citizens) {
    const pw = await h('Citizen@1234');
    await db.run(
      `INSERT INTO users (nid,name,age,address,latitude,longitude,profession,email,role,password_hash,is_verified)
       VALUES (?,?,?,?,?,?,?,?,'citizen',?,1)`,
      [c.nid,c.name,c.age,c.address,c.lat,c.lng,c.profession,c.email,pw]
    );
    for (const q of c.quals) await db.run('INSERT INTO qualifications (nid,degree,institution,field,year) VALUES (?,?,?,?,?)',[c.nid,...q]);
    for (const ct of c.contacts) await db.run('INSERT INTO contacts (nid,name,relationship,phone,email,address) VALUES (?,?,?,?,?,?)',[c.nid,...ct]);
    if (c.loc) await db.run('INSERT INTO locations (nid,country,city,employer,latitude,longitude) VALUES (?,?,?,?,?,?)',[c.nid,...c.loc]);
    console.log(`  ✓ Citizen:  ${c.email}   /  Citizen@1234`);
  }

  // Sample complaints
  await db.run(
    `INSERT INTO complaints (complainant_nid,subject,description,category,status,officer_reply,officer_nid,replied_at)
     VALUES (?,?,?,?,?,?,?,datetime('now'))`,
    ['200012345678','Salary not paid for 2 months',
     'My employer Tech Solutions LLC in Riyadh has not paid my salary for October and November 2024.',
     'salary','under_review',
     'We have registered your complaint and contacted the Sri Lankan Embassy in Riyadh. An investigation is underway.',
     'OFF001']
  );
  await db.run(
    'INSERT INTO complaints (complainant_nid,subject,description,category) VALUES (?,?,?,?)',
    ['199812345679','Accommodation conditions are unsafe',
     'The accommodation provided by my employer does not meet basic safety standards. 12 workers in a room for 4.',
     'accommodation']
  );
  console.log('  ✓ Sample complaints added\n');

  console.log('✅ Database seeded successfully!');
  console.log('──────────────────────────────────────────');
  console.log('  Start:    cd server && npm start');
  console.log('  App:      http://localhost:3000');
  console.log('  API Docs: http://localhost:3000/api-docs');
  console.log('──────────────────────────────────────────\n');
  process.exit(0);
}

seed().catch(err => { console.error('Seed failed:', err); process.exit(1); });

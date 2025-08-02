const mongoose = require('mongoose');

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Schemas
const PhaseSchema = new mongoose.Schema({
  clientId: { type: String, default: 'demo' },
  phase: String,
  goal: String,
  need: String,
  comments: String,
  execute: String,
  stage: String,
  commentArea: String,
  assigned_to: String
});

const TeamSchema = new mongoose.Schema({
  clientId: { type: String, default: 'demo' },
  username: String,
  email: String,
  org: { type: String, default: 'PHG' },
  not_working: { type: Boolean, default: false }
});

const Phase = mongoose.model('Phase', PhaseSchema);
const Team = mongoose.model('Team', TeamSchema);

async function seedDemoData() {
  try {
    console.log('Starting demo data seeding...');
    
    // Clear existing data
    await Phase.deleteMany({});
    await Team.deleteMany({});
    
    // Seed team members
    const demoTeam = [
      { username: 'Alice Johnson', email: 'alice.johnson@demo.com', org: 'PHG' },
      { username: 'Bob Smith', email: 'bob.smith@demo.com', org: 'PHG' },
      { username: 'Carol Lee', email: 'carol.lee@demo.com', org: 'PHG' },
      { username: 'David Kim', email: 'david.kim@demo.com', org: 'PHG' }
    ];
    await Team.insertMany(demoTeam);
    console.log('Demo team seeded successfully');
    
    // Seed demo phases/tasks
    const phases = ['Outstanding', 'Review/Discussion', 'In Process', 'Resolved'];
    const teamMembers = await Team.find();
    
    const demoTasks = [
      {
        clientId: 'demo',
        phase: 'Outstanding',
        goal: 'Complete project setup',
        need: 'Initial configuration',
        comments: 'Getting started with the project',
        execute: 'Setup phase',
        stage: 'Planning',
        commentArea: 'Ready to begin',
        assigned_to: teamMembers[0].username
      },
      {
        clientId: 'demo',
        phase: 'In Process',
        goal: 'Database integration',
        need: 'Connect to MongoDB',
        comments: 'Working on data layer',
        execute: 'Development phase',
        stage: 'Implementation',
        commentArea: 'In progress',
        assigned_to: teamMembers[1].username
      }
    ];
    
    await Phase.insertMany(demoTasks);
    console.log('Demo phases/tasks seeded successfully');
    
    console.log('Demo data seeding completed!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding demo data:', error);
    process.exit(1);
  }
}

seedDemoData(); 
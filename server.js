const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors({ origin: [
  'https://leewaller93.github.io',
  'http://localhost:3000'
], credentials: true }));
app.use(express.json());

// MongoDB/Mongoose Setup
console.log('MongoDB URI:', process.env.MONGODB_URI);
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected!'))
.catch(err => console.error('MongoDB connection error:', err));

// Mongoose Schemas
const PhaseSchema = new mongoose.Schema({
  phase: String,
  goal: String,
  need: String,
  comments: String,
  execute: String,
  stage: String,
  commentArea: String,
  assigned_to: String
});
const Phase = mongoose.model('Phase', PhaseSchema);

const TeamSchema = new mongoose.Schema({
  username: String,
  email: String,
  org: { type: String, default: 'PHG' },
  not_working: { type: Boolean, default: false }
});
const Team = mongoose.model('Team', TeamSchema);

const ProjectSchema = new mongoose.Schema({
  _id: { type: Number, default: 1 },
  name: String
});
const Project = mongoose.model('Project', ProjectSchema);

const WhiteboardStateSchema = new mongoose.Schema({
  _id: { type: Number, default: 1 },
  state_json: mongoose.Schema.Types.Mixed
});
const WhiteboardState = mongoose.model('WhiteboardState', WhiteboardStateSchema);

// Seed Demo Data if Collections are Empty
async function seedDemoData() {
  if ((await Team.countDocuments()) === 0) {
    const demoTeam = [
      { username: 'Alice Johnson', email: 'alice.johnson@demo.com', org: 'PHG' },
      { username: 'Bob Smith', email: 'bob.smith@demo.com', org: 'PHG' },
      { username: 'Carol Lee', email: 'carol.lee@demo.com', org: 'PHG' },
      { username: 'David Kim', email: 'david.kim@demo.com', org: 'PHG' }
    ];
    await Team.insertMany(demoTeam);
    console.log('Demo team seeded');
  }
  if ((await Phase.countDocuments()) === 0) {
    const demoTasks = [
      { phase: 'Outstanding', goal: 'General Ledger Review', need: '', comments: 'Audit the hospital’s existing general ledger to verify account balances, identify errors, and ensure GAAP compliance.', execute: 'One-Time', stage: 'Outstanding', commentArea: '', assigned_to: 'Alice Johnson' },
      { phase: 'Outstanding', goal: 'Accrual Process Assessment', need: '', comments: 'Evaluate current accrual methods for revenue (e.g., unbilled patient services) and expenses (e.g., utilities, salaries) for accuracy and consistency.', execute: 'One-Time', stage: 'Outstanding', commentArea: '', assigned_to: 'Bob Smith' },
      { phase: 'Outstanding', goal: 'Chart of Accounts Validation', need: '', comments: 'Review and align the hospital’s chart of accounts to ensure proper categorization for journal entries and financial reporting.', execute: 'One-Time', stage: 'Outstanding', commentArea: '', assigned_to: 'Carol Lee' },
      { phase: 'Outstanding', goal: 'Prior Period Entry Analysis', need: '', comments: 'Examine historical journal entries to identify recurring issues or misclassifications, preparing correcting entries as needed.', execute: 'One-Time', stage: 'Outstanding', commentArea: '', assigned_to: 'David Kim' },
      { phase: 'Outstanding', goal: 'Financial Statement Baseline Review', need: '', comments: 'Assess prior financial statements (balance sheet, income statement, cash flow statement) to establish a baseline for ongoing preparation and ensure compliance with GAAP and HIPAA.', execute: 'One-Time', stage: 'Outstanding', commentArea: '', assigned_to: 'Alice Johnson' }
    ];
    await Phase.insertMany(demoTasks);
    console.log('Demo phases seeded');
  }
  if ((await Project.countDocuments()) === 0) {
    await Project.create({ _id: 1, name: '' });
    console.log('Demo project seeded');
  }
  if ((await WhiteboardState.countDocuments()) === 0) {
    await WhiteboardState.create({ _id: 1, state_json: {} });
    console.log('Demo whiteboard state seeded');
  }
}

seedDemoData();

// --- API Endpoints ---

// Seed/reset endpoint for demo data
app.post('/api/seed', async (req, res) => {
  try {
    await Team.deleteMany({});
    await Phase.deleteMany({});
    await Project.deleteMany({});
    await WhiteboardState.deleteMany({});
    await seedDemoData();
    res.json({ seeded: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check endpoint for MongoDB connection
app.get('/health', (req, res) => {
  const state = mongoose.connection.readyState;
  // 1 = connected, 0 = disconnected, 2 = connecting, 3 = disconnecting
  res.json({ mongoState: state });
});

// Phases
app.get('/api/phases', async (req, res) => {
  try {
    const phases = await Phase.find();
    res.json(phases);
  } catch (err) {
      res.status(500).json({ error: err.message });
  }
});

app.post('/api/phases', async (req, res) => {
  try {
    const phase = await Phase.create(req.body);
    res.json({ id: phase._id });
  } catch (err) {
        res.status(500).json({ error: err.message });
  }
});

app.put('/api/phases/:id', async (req, res) => {
  try {
    const updated = await Phase.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ updated: !!updated });
  } catch (err) {
        res.status(500).json({ error: err.message });
  }
});

app.delete('/api/phases/:id', async (req, res) => {
  try {
    const deleted = await Phase.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Task not found' });
    res.json({ deleted: true });
  } catch (err) {
      res.status(500).json({ error: err.message });
  }
});

// Team
app.get('/api/team', async (req, res) => {
  try {
    const team = await Team.find();
    res.json(team);
  } catch (err) {
      res.status(500).json({ error: err.message });
    }
});

app.post('/api/invite', async (req, res) => {
  const { username, email, org } = req.body;
  if (!username || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid username or email' });
  }
  try {
    await Team.create({ username, email, org: org || 'PHG' });
    res.json({ message: 'User added', username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/team/:id/not-working', async (req, res) => {
  const { id } = req.params;
  const { reassign_to } = req.body;
  try {
    const member = await Team.findById(id);
    if (!member) return res.status(404).json({ error: 'Team member not found' });
    // Reassign all tasks
    await Phase.updateMany({ assigned_to: member.username }, { assigned_to: reassign_to || 'team' });
      // Mark as not working
    await Team.findByIdAndUpdate(id, { not_working: true });
    res.json({ updated: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Project
app.post('/api/project', async (req, res) => {
  const { name } = req.body;
  try {
    await Project.findByIdAndUpdate(1, { name }, { upsert: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/project', async (req, res) => {
  try {
    const project = await Project.findById(1);
    res.json({ name: project ? project.name : '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Whiteboard State
app.get('/api/whiteboard', async (req, res) => {
  try {
    const state = await WhiteboardState.findById(1);
    res.json(state ? state.state_json : {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/whiteboard', async (req, res) => {
  try {
    await WhiteboardState.findByIdAndUpdate(1, { state_json: req.body }, { upsert: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health Check
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`HAS Status backend running on port ${PORT}`);
}); 
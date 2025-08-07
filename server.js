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
.then(async () => {
  console.log('MongoDB connected!');
  
  // Database migration: Drop old clientCode index if it exists
  try {
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    const clientsCollection = collections.find(col => col.name === 'clients');
    
    if (clientsCollection) {
      const indexes = await db.collection('clients').indexes();
      const clientCodeIndex = indexes.find(index => 
        index.key && index.key.clientCode === 1
      );
      
      if (clientCodeIndex) {
        console.log('Dropping old clientCode index...');
        await db.collection('clients').dropIndex('clientCode_1');
        console.log('Old clientCode index dropped successfully');
      }
    }
  } catch (err) {
    console.log('Index migration check completed (no action needed):', err.message);
  }
})
.catch(err => console.error('MongoDB connection error:', err));

// Mongoose Schemas
const PhaseSchema = new mongoose.Schema({
  clientId: { type: String, default: 'demo' }, // Add client ID for multi-tenancy
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
  clientId: { type: String, default: 'demo' }, // Add client ID for multi-tenancy
  username: String,
  email: String,
  org: { type: String, default: 'PHG' },
  not_working: { type: Boolean, default: false }
});
const Team = mongoose.model('Team', TeamSchema);

const ProjectSchema = new mongoose.Schema({
  clientId: { type: String, default: 'demo' }, // Add client ID for multi-tenancy
  _id: { type: Number, default: 1 },
  name: String
});
const Project = mongoose.model('Project', ProjectSchema);

// Enhanced Client Schema for storing client information
const ClientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  mainContact: { type: String, default: '' },
  phoneNumber: { type: String, default: '' },
  city: { type: String, default: '' },
  state: { type: String, default: '' },
  facCode: { type: String, required: true, unique: true, validate: {
    validator: function(v) {
      return /^[A-Z0-9]{3}$/.test(v);
    },
    message: 'Client Code must be exactly 3 alphanumeric characters'
  }},
  filePath: { type: String, default: '' },
  color: { type: String, default: '#2563eb' },
  createdAt: { type: Date, default: Date.now },
  // Backward compatibility fields
  clientId: { type: String },
  contactPerson: { type: String }
});
const Client = mongoose.model('Client', ClientSchema);

// Internal Team Schema for managing team members
const InternalTeamSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  teamName: { type: String, default: 'PHG' },
  assignedClients: [{ type: String }], // Array of FAC codes
  createdAt: { type: Date, default: Date.now }
});
const InternalTeam = mongoose.model('InternalTeam', InternalTeamSchema);

// Audit Trail Schema for tracking deletions
const AuditTrailSchema = new mongoose.Schema({
  clientId: { type: String, required: true },
  action: { type: String, required: true }, // 'delete_team_member', 'delete_task', 'reassign_tasks'
  targetId: { type: String, required: true }, // ID of deleted item
  targetName: { type: String, required: true }, // Name of deleted item
  details: { type: String }, // Additional details like reassignment info
  performedBy: { type: String, required: true }, // User who performed the action
  timestamp: { type: Date, default: Date.now }
});
const AuditTrail = mongoose.model('AuditTrail', AuditTrailSchema);

const WhiteboardStateSchema = new mongoose.Schema({
  _id: { type: Number, default: 1 },
  state_json: mongoose.Schema.Types.Mixed
});
const WhiteboardState = mongoose.model('WhiteboardState', WhiteboardStateSchema);

// Seed Demo Data if Collections are Empty
async function seedDemoData() {
  if ((await Team.countDocuments()) === 0) {
    // Only create PHGHAS team member - no other demo members
    const phgTeamMember = new Team({
      username: 'PHGHAS', 
      email: 'phghas@phg.com', 
      org: 'PHG'
    });
    await phgTeamMember.save();
    console.log('PHGHAS team member seeded');
  }
  // Always clear phases before seeding
  await Phase.deleteMany({});
  if ((await Phase.countDocuments()) === 0) {
    const phases = ['Outstanding', 'Review/Discussion', 'In Process', 'Resolved'];
    const teamMembers = await Team.find();
    const tasks = [
      { goal: 'General Ledger Review', comments: 'Audit the hospital’s existing general ledger to verify account balances, identify errors, and ensure GAAP compliance.', execute: 'One-Time' },
      { goal: 'Accrual Process Assessment', comments: 'Evaluate current accrual methods for revenue (e.g., unbilled patient services) and expenses (e.g., utilities, salaries) for accuracy and consistency.', execute: 'One-Time' },
      { goal: 'Chart of Accounts Validation', comments: 'Review and align the hospital’s chart of accounts to ensure proper categorization for journal entries and financial reporting.', execute: 'One-Time' },
      { goal: 'Prior Period Entry Analysis', comments: 'Examine historical journal entries to identify recurring issues or misclassifications, preparing correcting entries as needed.', execute: 'One-Time' },
      { goal: 'Financial Statement Baseline Review', comments: 'Assess prior financial statements (balance sheet, income statement, cash flow statement) to establish a baseline for ongoing preparation and ensure compliance with GAAP and HIPAA.', execute: 'One-Time' },
      { goal: 'Revenue Accrual Entries', comments: 'Post journal entries for accrued revenue from unbilled patient services, using patient encounter data and estimated insurance reimbursements.', execute: 'Weekly' },
      { goal: 'Expense Accrual Entries', comments: 'Record accrued expenses for incurred but unpaid costs (e.g., utilities, vendor services) based on historical data or pending invoices.', execute: 'Weekly' },
      { goal: 'Cash Receipt Journal Entries', comments: 'Log journal entries for cash receipts from patients or insurers, debiting cash and crediting revenue or accounts receivable.', execute: 'Weekly' },
      { goal: 'Preliminary Journal Review', comments: 'Review weekly journal entries for correct account coding, completeness, and supporting documentation (e.g., payment records).', execute: 'Weekly' },
      { goal: 'Adjusting Entry Corrections', comments: 'Prepare and post adjusting entries to correct errors or discrepancies identified during weekly general ledger reviews.', execute: 'Weekly' },
      { goal: 'Month-End Accrual Finalization', comments: 'Finalize and post accrual entries for revenue (e.g., unbilled procedures, pending claims) and expenses (e.g., salaries, leases) to align with GAAP.', execute: 'Monthly' },
      { goal: 'Depreciation Journal Entries', comments: 'Record monthly depreciation entries for hospital assets (e.g., medical equipment, facilities) using established schedules.', execute: 'Monthly' },
      { goal: 'Prepaid Expense Amortization', comments: 'Post journal entries to amortize prepaid expenses (e.g., insurance, software licenses) over their applicable periods.', execute: 'Monthly' },
      { goal: 'Financial Statement Preparation', comments: 'Prepare monthly financial statements (balance sheet, income statement, cash flow statement) using journal entry data, ensuring accuracy and GAAP compliance.', execute: 'Monthly' },
      { goal: 'Comprehensive Ledger and Financial Review', comments: 'Conduct a detailed review of all monthly journal entries and financial statements, verifying accuracy, accrual integrity, and compliance with GAAP and HIPAA.', execute: 'Monthly' },
      { goal: 'Accrual Reversal Entries', comments: 'Post reversing entries for prior month’s accruals (e.g., paid invoices, settled claims) to prevent double-counting in the ledger.', execute: 'Monthly' }
    ];
    // Randomly assign each task to a phase and a team member
    const demoTasks = tasks.map((task, i) => {
      const phase = phases[Math.floor(Math.random() * phases.length)];
      // Prefer PHGHAS for assignment, fallback to other team members
      const phghasMember = teamMembers.find(m => m.username === 'PHGHAS');
      const assigned_to = phghasMember ? 'PHGHAS' : (teamMembers.length > 0 ? teamMembers[i % teamMembers.length].username : 'team');
      return {
        phase,
        goal: task.goal,
        need: '',
        comments: task.comments,
        execute: task.execute,
        stage: phase,
        commentArea: '',
        assigned_to
      };
    });
    await Phase.insertMany(demoTasks);
    console.log('All demo phases seeded:', demoTasks.length, 'tasks');
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
    const clientId = req.query.clientId || 'demo';
    const phases = await Phase.find({ clientId });
    res.json(phases);
  } catch (err) {
      res.status(500).json({ error: err.message });
  }
});

app.post('/api/phases', async (req, res) => {
  try {
    const clientId = req.query.clientId || req.body.clientId || 'demo';
    const phase = await Phase.create({ ...req.body, clientId });
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

// Mass update phases for a client
app.patch('/api/phases/mass-update', async (req, res) => {
  const { clientId, field, value, taskIds, performedBy } = req.body;
  
  try {
    const updateData = {};
    updateData[field] = value;
    
    let query = { clientId };
    if (taskIds && taskIds.length > 0) {
      query._id = { $in: taskIds };
    }
    
    const result = await Phase.updateMany(query, updateData);
    
    // Log to audit trail
    const auditEntry = new AuditTrail({
      clientId,
      action: 'mass_update',
      targetId: taskIds ? taskIds.join(',') : 'all',
      targetName: `${field} update`,
      details: `Updated ${result.modifiedCount} tasks: ${field} = ${value}`,
      performedBy: performedBy || 'admin'
    });
    await auditEntry.save();
    
    res.json({ updated: true, count: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Unified mass update phases for a client (multiple fields)
app.patch('/api/phases/unified-mass-update', async (req, res) => {
  const { clientId, stage, assigned_to, need, taskIds, performedBy } = req.body;
  
  try {
    const updateData = {};
    if (stage) updateData.stage = stage;
    if (assigned_to) updateData.assigned_to = assigned_to;
    if (need) updateData.need = need;
    
    // Check if at least one field is being updated
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    let query = { clientId };
    if (taskIds && taskIds.length > 0) {
      query._id = { $in: taskIds };
    }
    
    const result = await Phase.updateMany(query, updateData);
    
    // Log to audit trail
    const updateDetails = Object.entries(updateData)
      .map(([field, value]) => `${field} = ${value}`)
      .join(', ');
    
    const auditEntry = new AuditTrail({
      clientId,
      action: 'unified_mass_update',
      targetId: taskIds ? taskIds.join(',') : 'all',
      targetName: 'Multiple fields update',
      details: `Updated ${result.modifiedCount} tasks: ${updateDetails}`,
      performedBy: performedBy || 'admin'
    });
    await auditEntry.save();
    
    res.json({ updated: true, count: result.modifiedCount, fieldsUpdated: Object.keys(updateData) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/phases/:id', async (req, res) => {
  const { id } = req.params;
  const { clientId, performedBy } = req.query;
  
  try {
    const deleted = await Phase.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: 'Task not found' });
    
    // Log to audit trail
    const auditEntry = new AuditTrail({
      clientId,
      action: 'delete_task',
      targetId: id,
      targetName: deleted.name || 'Unknown Task',
      details: `Task deleted from phase: ${deleted.phase || 'Unknown'}`,
      performedBy: performedBy || 'admin'
    });
    await auditEntry.save();
    
    res.json({ deleted: true });
  } catch (err) {
      res.status(500).json({ error: err.message });
  }
});

// Clear all phases for a client
app.delete('/api/phases', async (req, res) => {
  const { clientId, performedBy } = req.query;
  
  try {
    const deleted = await Phase.deleteMany({ clientId });
    
    // Log to audit trail
    const auditEntry = new AuditTrail({
      clientId,
      action: 'clear_all_tasks',
      targetId: 'all',
      targetName: 'All Tasks',
      details: `Cleared ${deleted.deletedCount} tasks for client ${clientId}`,
      performedBy: performedBy || 'admin'
    });
    await auditEntry.save();
    
    res.json({ deleted: true, count: deleted.deletedCount });
  } catch (err) {
      res.status(500).json({ error: err.message });
  }
});

// Team
app.get('/api/team', async (req, res) => {
  try {
    const clientId = req.query.clientId || 'demo';
    const team = await Team.find({ clientId });
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
    const clientId = req.query.clientId || req.body.clientId || 'demo';
    await Team.create({ username, email, org: org || 'PHG', clientId });
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

// Update team member
app.put('/api/team/:id', async (req, res) => {
  const { id } = req.params;
  const { username, email, clientId } = req.body;
  
  try {
    const teamMember = await Team.findOne({ _id: id, clientId });
    if (!teamMember) {
      return res.status(404).json({ error: 'Team member not found' });
    }
    
    // Update the team member
    const updatedMember = await Team.findByIdAndUpdate(
      id, 
      { username, email },
      { new: true }
    );
    
    // Update all tasks assigned to this member with the new username
    if (username !== teamMember.username) {
      await Phase.updateMany(
        { clientId, assigned_to: teamMember.username },
        { assigned_to: username }
      );
    }
    
    res.json({ 
      success: true, 
      updatedMember,
      tasksUpdated: username !== teamMember.username
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete team member with task reassignment logic
app.delete('/api/team/:id', async (req, res) => {
  const { id } = req.params;
  const { clientId, reassignTo, performedBy } = req.query;
  
  try {
    const teamMember = await Team.findOne({ _id: id, clientId });
    if (!teamMember) {
      return res.status(404).json({ error: 'Team member not found' });
    }
    
    // Check if team member has assigned tasks
    const tasks = await Phase.find({ clientId, assigned_to: teamMember.username });
    let hasAssignedTasks = tasks.length > 0;
    let assignedTasks = tasks.map(task => ({
      taskId: task._id,
      taskName: task.goal,
      phaseName: task.stage
    }));
    
    if (hasAssignedTasks && !reassignTo) {
      // Return tasks that need to be reassigned
      return res.status(400).json({ 
        error: 'Team member has assigned tasks',
        needsReassignment: true,
        assignedTasks,
        teamMemberName: teamMember.username
      });
    }
    
    // If reassignment is provided, update all tasks
    if (reassignTo && hasAssignedTasks) {
      await Phase.updateMany(
        { clientId, assigned_to: teamMember.username },
        { assigned_to: reassignTo }
      );
    }
    
    // Delete the team member
    await Team.findByIdAndDelete(id);
    
    // Log to audit trail
    const auditEntry = new AuditTrail({
      clientId,
      action: 'delete_team_member',
      targetId: id,
      targetName: teamMember.username,
      details: hasAssignedTasks ? `Tasks reassigned to: ${reassignTo}` : 'No tasks to reassign',
      performedBy: performedBy || 'admin'
    });
    await auditEntry.save();
    
    res.json({ 
      success: true, 
      reassignedTasks: hasAssignedTasks ? assignedTasks.length : 0,
      reassignedTo: reassignTo
    });
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

// Enhanced Client Management
app.post('/api/clients', async (req, res) => {
  try {
    console.log('Client creation request (FORCE REDEPLOY):', req.body);
    const { name, mainContact, phoneNumber, city, state, facCode, filePath, color } = req.body;
    
    // Check if client already exists by facCode
    const existingClient = await Client.findOne({ facCode });
    if (existingClient) {
      console.log('Client already exists:', facCode);
      return res.status(400).json({ error: 'Client Code already exists' });
    }
    
    // Also check if client exists by clientId (for backward compatibility)
    const existingClientById = await Client.findOne({ clientId: facCode });
    if (existingClientById) {
      console.log('Client already exists by clientId:', facCode);
      return res.status(400).json({ error: 'Client Code already exists' });
    }
    
    const newClient = new Client({
      name,
      mainContact: mainContact || '',
      phoneNumber: phoneNumber || '',
      city: city || '',
      state: state || '',
      facCode,
      clientId: facCode, // Set clientId to facCode to avoid null duplicate key error
      filePath: filePath || '',
      color: color || '#2563eb'
    });
    
    console.log('Saving new client:', newClient);
    await newClient.save();
    console.log('Client saved successfully');
    
    // Automatically create PHGHAS team member for new client
    const phgTeamMember = new Team({
      clientId: facCode,
      username: 'PHGHAS',
      email: 'phghas@phg.com',
      org: 'PHG'
    });
    
    console.log('Creating PHGHAS team member for client:', facCode);
    await phgTeamMember.save();
    console.log('PHGHAS team member created successfully');
    
    res.json({ success: true, client: newClient });
  } catch (err) {
    console.error('Error creating client:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/clients', async (req, res) => {
  try {
    const clients = await Client.find().sort({ createdAt: -1 });
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/clients/:clientId', async (req, res) => {
  try {
    // Try to find by facCode first, then by clientId for backward compatibility
    let client = await Client.findOne({ facCode: req.params.clientId });
    if (!client) {
      client = await Client.findOne({ clientId: req.params.clientId });
    }
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json(client);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/clients/:clientId', async (req, res) => {
  try {
    const { name, mainContact, phoneNumber, city, state, facCode, filePath, color } = req.body;
    // Try to find and update by facCode first, then by clientId for backward compatibility
    let updatedClient = await Client.findOneAndUpdate(
      { facCode: req.params.clientId },
      { name, mainContact, phoneNumber, city, state, facCode, filePath, color },
      { new: true }
    );
    if (!updatedClient) {
      updatedClient = await Client.findOneAndUpdate(
        { clientId: req.params.clientId },
        { name, mainContact, phoneNumber, city, state, facCode, filePath, color },
        { new: true }
      );
    }
    if (!updatedClient) {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json({ success: true, client: updatedClient });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/clients/:clientId', async (req, res) => {
  try {
    // Try to find and delete by facCode first, then by clientId for backward compatibility
    let deletedClient = await Client.findOneAndDelete({ facCode: req.params.clientId });
    if (!deletedClient) {
      deletedClient = await Client.findOneAndDelete({ clientId: req.params.clientId });
    }
    if (!deletedClient) {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Internal Team Management
app.post('/api/internal-team', async (req, res) => {
  try {
    const { name, email, teamName, assignedClients } = req.body;
    
    // Check if team member already exists
    const existingMember = await InternalTeam.findOne({ email });
    if (existingMember) {
      return res.status(400).json({ error: 'Team member with this email already exists' });
    }
    
    const newTeamMember = new InternalTeam({
      name,
      email,
      teamName,
      assignedClients
    });
    
    await newTeamMember.save();
    res.json({ success: true, teamMember: newTeamMember });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/internal-team', async (req, res) => {
  try {
    const teamMembers = await InternalTeam.find().sort({ createdAt: -1 });
    res.json(teamMembers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/internal-team/:email', async (req, res) => {
  try {
    const teamMember = await InternalTeam.findOne({ email: req.params.email });
    if (!teamMember) {
      return res.status(404).json({ error: 'Team member not found' });
    }
    res.json(teamMember);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/internal-team/:id', async (req, res) => {
  try {
    const { name, email, teamName, assignedClients } = req.body;
    const updatedMember = await InternalTeam.findByIdAndUpdate(
      req.params.id,
      { name, email, teamName, assignedClients },
      { new: true }
    );
    if (!updatedMember) {
      return res.status(404).json({ error: 'Team member not found' });
    }
    res.json({ success: true, teamMember: updatedMember });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/internal-team/:id', async (req, res) => {
  try {
    const deletedMember = await InternalTeam.findByIdAndDelete(req.params.id);
    if (!deletedMember) {
      return res.status(404).json({ error: 'Team member not found' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Audit Trail endpoints
app.get('/api/audit-trail', async (req, res) => {
  try {
    const { clientId } = req.query;
    const query = clientId ? { clientId } : {};
    const auditTrail = await AuditTrail.find(query).sort({ timestamp: -1 });
    res.json(auditTrail);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/audit-trail/:clientId', async (req, res) => {
  try {
    const auditTrail = await AuditTrail.find({ clientId: req.params.clientId }).sort({ timestamp: -1 });
    res.json(auditTrail);
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
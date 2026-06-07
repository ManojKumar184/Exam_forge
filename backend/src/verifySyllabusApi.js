import axios from 'axios';

async function verifySyllabus() {
  const API_URL = 'http://localhost:5000/api';
  console.log('--- Phase 2 Syllabus API Verification ---');

  // 1. Login as Admin
  console.log('Logging in as admin...');
  const loginRes = await axios.post(`${API_URL}/auth/login`, {
    email: 'admin@examforge.com',
    password: 'Admin@123',
  });
  const token = loginRes.data.data.accessToken;
  console.log('Login successful. Access token retrieved.');

  const client = axios.create({
    headers: { Authorization: `Bearer ${token}` },
  });

  // 2. Fetch Syllabus Tree
  console.log('\nFetching syllabus tree...');
  const treeRes = await client.get(`${API_URL}/syllabus/tree`);
  const tree = treeRes.data.data;
  console.log(`Retrieved syllabus tree with ${tree.length} root nodes.`);

  const jeeMain = tree.find((n) => n.name === 'JEE Main');
  const neet = tree.find((n) => n.name === 'NEET');
  const cbse = tree.find((n) => n.name === 'CBSE');

  if (jeeMain && neet && cbse) {
    console.log('✓ Success: Initial standard curricula (JEE Main, NEET, CBSE) are present.');
  } else {
    throw new Error('Missing standard curricula in the seeded syllabus tree!');
  }

  // Find Kinematics chapter node to add a custom topic child
  // JEE Main -> Class 11 -> Physics -> Kinematics
  const class11 = jeeMain.children?.find((n) => n.name === 'Class 11');
  const physics = class11?.children?.find((n) => n.name === 'Physics');
  const kinematics = physics?.children?.find((n) => n.name === 'Kinematics');

  if (!kinematics) {
    throw new Error('Could not locate Kinematics chapter node in tree!');
  }
  console.log(`Found chapter node "Kinematics" ID: ${kinematics._id}`);

  // 3. Create Custom Topic under Kinematics
  console.log('\nCreating custom topic node under Kinematics...');
  const createRes = await client.post(`${API_URL}/syllabus`, {
    name: 'Custom E2E Topic',
    code: 'JEEM_PHY_KIN_E2E',
    type: 'topic',
    parentId: kinematics._id,
  });
  const createdNode = createRes.data.data;
  console.log(`✓ Success: Created node "${createdNode.name}" with level ${createdNode.level} (Type: ${createdNode.type})`);

  if (createdNode.level !== 4 || createdNode.type !== 'topic') {
    throw new Error('Created node level or type mismatch!');
  }

  // 4. Update Custom Node
  console.log('\nUpdating custom topic node...');
  const updateRes = await client.patch(`${API_URL}/syllabus/${createdNode._id}`, {
    name: 'Updated E2E Topic',
    code: 'JEEM_PHY_KIN_E2E_UPDATED',
  });
  const updatedNode = updateRes.data.data;
  console.log(`✓ Success: Updated node name to "${updatedNode.name}" and code to "${updatedNode.code}"`);

  if (updatedNode.name !== 'Updated E2E Topic') {
    throw new Error('Updated node name mismatch!');
  }

  // 5. Query Questions with Syllabus Filters
  console.log('\nQuerying questions with syllabus filters...');
  const questionsRes = await client.get(`${API_URL}/questions`, {
    params: {
      syllabus_exam_pattern_id: jeeMain._id,
      syllabus_class_id: class11._id,
      syllabus_subject_id: physics._id,
      syllabus_chapter_id: kinematics._id,
    },
  });
  const questions = questionsRes.data.data.items;
  console.log(`✓ Success: Query returned ${questions.length} questions matching syllabus mapping filters.`);

  // 6. Delete Custom Node
  console.log('\nDeleting custom topic node...');
  const deleteRes = await client.delete(`${API_URL}/syllabus/${createdNode._id}`);
  console.log(`✓ Success: Delete API message: "${deleteRes.data.message}"`);

  console.log('\n🎉 ALL SYLLABUS API VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉');
}

verifySyllabus().catch((err) => {
  console.error('✗ Verification failed:', err.message);
  if (err.response) {
    console.error('Response error details:', err.response.data);
  }
  process.exit(1);
});

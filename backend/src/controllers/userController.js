import * as userService from '../services/userService.js';

export async function list(req, res) {
  const data = await userService.listUsers(req.query);
  res.json({ success: true, data });
}

export async function getOne(req, res) {
  const data = await userService.getUserById(req.params.id);
  res.json({ success: true, data });
}

export async function update(req, res) {
  const data = await userService.updateUser(req.params.id, req.body);
  res.json({ success: true, data });
}

export async function remove(req, res) {
  await userService.deleteUser(req.params.id);
  res.json({ success: true, message: 'User deleted successfully' });
}

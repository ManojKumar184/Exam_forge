import { SyllabusNode } from '../models/SyllabusNode.js';
import { AppError } from '../utils/AppError.js';

export async function list(req, res) {
  const filter = {};
  if (req.query.parentId) filter.parentId = req.query.parentId;
  if (req.query.type) filter.type = req.query.type;
  if (req.query.level) filter.level = Number(req.query.level);
  if (req.query.search) {
    filter.name = { $regex: req.query.search, $options: 'i' };
  }

  const nodes = await SyllabusNode.find(filter).sort({ name: 1 });
  res.json({ success: true, data: nodes });
}

export async function getTree(req, res) {
  const nodes = await SyllabusNode.find({ isActive: true }).lean();
  
  // Build lookup maps
  const idMap = {};
  nodes.forEach(node => {
    idMap[node._id.toString()] = { ...node, children: [] };
  });

  const roots = [];
  Object.values(idMap).forEach(node => {
    if (node.parentId) {
      const parent = idMap[node.parentId.toString()];
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node); // Parent not in active set, treat as root
      }
    } else {
      roots.push(node);
    }
  });

  res.json({ success: true, data: roots });
}

export async function getOne(req, res) {
  const node = await SyllabusNode.findById(req.params.id);
  if (!node) throw new AppError('Syllabus node not found', 404, 'NOT_FOUND');
  res.json({ success: true, data: node });
}

export async function create(req, res) {
  const { name, code, type, parentId, isActive, isCustom } = req.body;

  let level = 0;
  let path = '';
  
  if (parentId) {
    const parent = await SyllabusNode.findById(parentId);
    if (!parent) throw new AppError('Parent node not found', 400, 'INVALID_PARENT');
    level = parent.level + 1;
    path = `${parent.path}${parent._id},`;
  } else {
    path = ',';
  }

  const node = await SyllabusNode.create({
    name,
    code,
    type,
    parentId: parentId || null,
    path,
    level,
    isActive: isActive !== false,
    isCustom: isCustom === true,
  });

  res.status(201).json({ success: true, data: node });
}

export async function update(req, res) {
  const node = await SyllabusNode.findById(req.params.id);
  if (!node) throw new AppError('Syllabus node not found', 404, 'NOT_FOUND');

  const { name, code, isActive } = req.body;
  if (name !== undefined) node.name = name;
  if (code !== undefined) node.code = code.toUpperCase();
  if (isActive !== undefined) node.isActive = isActive;

  await node.save();
  res.json({ success: true, data: node });
}

export async function remove(req, res) {
  const node = await SyllabusNode.findById(req.params.id);
  if (!node) throw new AppError('Syllabus node not found', 404, 'NOT_FOUND');

  // Check if node has children
  const childrenCount = await SyllabusNode.countDocuments({ parentId: node._id });
  if (childrenCount > 0) {
    throw new AppError('Cannot delete node with descendants', 400, 'HAS_DESCENDANTS');
  }

  await node.deleteOne();
  res.json({ success: true, message: 'Syllabus node deleted' });
}

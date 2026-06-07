import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { SyllabusNode } from './models/SyllabusNode.js';

const syllabusData = [
  {
    name: 'JEE Main',
    code: 'JEE_MAIN',
    type: 'exam_pattern',
    children: [
      {
        name: 'Class 11',
        code: 'JEEM_C11',
        type: 'class',
        children: [
          {
            name: 'Physics',
            code: 'JEEM_C11_PHY',
            type: 'subject',
            children: [
              {
                name: 'Kinematics',
                code: 'JEEM_C11_PHY_KIN',
                type: 'chapter',
                children: [
                  {
                    name: 'Motion in a Straight Line',
                    code: 'JEEM_C11_PHY_KIN_MSL',
                    type: 'topic',
                    children: [
                      { name: 'Speed and Velocity', code: 'JEEM_C11_PHY_KIN_MSL_SV', type: 'subtopic' },
                      { name: 'Acceleration', code: 'JEEM_C11_PHY_KIN_MSL_ACC', type: 'subtopic' }
                    ]
                  },
                  {
                    name: 'Motion in a Plane',
                    code: 'JEEM_C11_PHY_KIN_MP',
                    type: 'topic',
                    children: [
                      { name: 'Projectile Motion', code: 'JEEM_C11_PHY_KIN_MP_PM', type: 'subtopic' },
                      { name: 'Uniform Circular Motion', code: 'JEEM_C11_PHY_KIN_MP_UCM', type: 'subtopic' }
                    ]
                  }
                ]
              },
              {
                name: 'Laws of Motion',
                code: 'JEEM_C11_PHY_LOM',
                type: 'chapter',
                children: [
                  {
                    name: 'Newtons Laws of Motion',
                    code: 'JEEM_C11_PHY_LOM_NLM',
                    type: 'topic',
                    children: [
                      { name: 'First and Second Laws', code: 'JEEM_C11_PHY_LOM_NLM_12L', type: 'subtopic' },
                      { name: 'Third Law and Momentum', code: 'JEEM_C11_PHY_LOM_NLM_3LM', type: 'subtopic' }
                    ]
                  },
                  {
                    name: 'Friction',
                    code: 'JEEM_C11_PHY_LOM_FRC',
                    type: 'topic',
                    children: [
                      { name: 'Static and Kinetic Friction', code: 'JEEM_C11_PHY_LOM_FRC_SKF', type: 'subtopic' }
                    ]
                  }
                ]
              }
            ]
          },
          {
            name: 'Chemistry',
            code: 'JEEM_C11_CHM',
            type: 'subject',
            children: [
              {
                name: 'Some Basic Concepts of Chemistry',
                code: 'JEEM_C11_CHM_SBC',
                type: 'chapter',
                children: [
                  {
                    name: 'Mole Concept',
                    code: 'JEEM_C11_CHM_SBC_MC',
                    type: 'topic',
                    children: [
                      { name: 'Atomic and Molecular Masses', code: 'JEEM_C11_CHM_SBC_MC_AM', type: 'subtopic' },
                      { name: 'Stoichiometry', code: 'JEEM_C11_CHM_SBC_MC_ST', type: 'subtopic' }
                    ]
                  }
                ]
              }
            ]
          },
          {
            name: 'Mathematics',
            code: 'JEEM_C11_MTH',
            type: 'subject',
            children: [
              {
                name: 'Sets and Functions',
                code: 'JEEM_C11_MTH_SF',
                type: 'chapter',
                children: [
                  {
                    name: 'Sets',
                    code: 'JEEM_C11_MTH_SF_SETS',
                    type: 'topic',
                    children: [
                      { name: 'Types of Sets', code: 'JEEM_C11_MTH_SF_SETS_TYPES', type: 'subtopic' },
                      { name: 'Venn Diagrams', code: 'JEEM_C11_MTH_SF_SETS_VENN', type: 'subtopic' }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        name: 'Class 12',
        code: 'JEEM_C12',
        type: 'class',
        children: [
          {
            name: 'Physics',
            code: 'JEEM_C12_PHY',
            type: 'subject',
            children: [
              {
                name: 'Electrostatics',
                code: 'JEEM_C12_PHY_ELS',
                type: 'chapter',
                children: [
                  {
                    name: 'Electric Charges and Fields',
                    code: 'JEEM_C12_PHY_ELS_ECF',
                    type: 'topic',
                    children: [
                      { name: 'Coulombs Law', code: 'JEEM_C12_PHY_ELS_ECF_CL', type: 'subtopic' },
                      { name: 'Electric Dipole', code: 'JEEM_C12_PHY_ELS_ECF_ED', type: 'subtopic' }
                    ]
                  }
                ]
              }
            ]
          },
          {
            name: 'Chemistry',
            code: 'JEEM_C12_CHM',
            type: 'subject',
            children: [
              {
                name: 'Chemical Kinetics',
                code: 'JEEM_C12_CHM_CK',
                type: 'chapter',
                children: [
                  {
                    name: 'Rate of Reaction',
                    code: 'JEEM_C12_CHM_CK_ROR',
                    type: 'topic',
                    children: [
                      { name: 'Factors Affecting Rate', code: 'JEEM_C12_CHM_CK_ROR_FAR', type: 'subtopic' }
                    ]
                  }
                ]
              }
            ]
          },
          {
            name: 'Mathematics',
            code: 'JEEM_C12_MTH',
            type: 'subject',
            children: [
              {
                name: 'Calculus',
                code: 'JEEM_C12_MTH_CAL',
                type: 'chapter',
                children: [
                  {
                    name: 'Integrals',
                    code: 'JEEM_C12_MTH_CAL_INT',
                    type: 'topic',
                    children: [
                      { name: 'Definite Integrals', code: 'JEEM_C12_MTH_CAL_INT_DI', type: 'subtopic' }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  {
    name: 'NEET',
    code: 'NEET',
    type: 'exam_pattern',
    children: [
      {
        name: 'Class 11',
        code: 'NEET_C11',
        type: 'class',
        children: [
          {
            name: 'Biology',
            code: 'NEET_C11_BIO',
            type: 'subject',
            children: [
              {
                name: 'Diversity in Living World',
                code: 'NEET_C11_BIO_DLW',
                type: 'chapter',
                children: [
                  {
                    name: 'Animal Kingdom',
                    code: 'NEET_C11_BIO_DLW_AK',
                    type: 'topic',
                    children: [
                      { name: 'Classification of Animals', code: 'NEET_C11_BIO_DLW_AK_COA', type: 'subtopic' }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        name: 'Class 12',
        code: 'NEET_C12',
        type: 'class',
        children: [
          {
            name: 'Biology',
            code: 'NEET_C12_BIO',
            type: 'subject',
            children: [
              {
                name: 'Genetics and Evolution',
                code: 'NEET_C12_BIO_GE',
                type: 'chapter',
                children: [
                  {
                    name: 'Principles of Inheritance',
                    code: 'NEET_C12_BIO_GE_POI',
                    type: 'topic',
                    children: [
                      { name: 'Mendelian Laws', code: 'NEET_C12_BIO_GE_POI_ML', type: 'subtopic' }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  {
    name: 'CBSE',
    code: 'CBSE',
    type: 'exam_pattern',
    children: [
      {
        name: 'Class 11',
        code: 'CBSE_C11',
        type: 'class',
        children: [
          {
            name: 'Physics',
            code: 'CBSE_C11_PHY',
            type: 'subject',
            children: [
              {
                name: 'Physical World and Measurement',
                code: 'CBSE_C11_PHY_PWM',
                type: 'chapter',
                children: [
                  {
                    name: 'Units and Measurements',
                    code: 'CBSE_C11_PHY_PWM_UM',
                    type: 'topic',
                    children: [
                      { name: 'SI Units', code: 'CBSE_C11_PHY_PWM_UM_SI', type: 'subtopic' }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        name: 'Class 12',
        code: 'CBSE_C12',
        type: 'class',
        children: [
          {
            name: 'Physics',
            code: 'CBSE_C12_PHY',
            type: 'subject',
            children: [
              {
                name: 'Electrostatics',
                code: 'CBSE_C12_PHY_ELS',
                type: 'chapter',
                children: [
                  {
                    name: 'Electric Field',
                    code: 'CBSE_C12_PHY_ELS_EF',
                    type: 'topic',
                    children: [
                      { name: 'Gauss Law', code: 'CBSE_C12_PHY_ELS_EF_GL', type: 'subtopic' }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
];

export async function seedSyllabus() {
  console.log('[seeder] Clearing existing syllabus nodes...');
  await SyllabusNode.deleteMany({});
  
  async function seedBranch(children, parentId = null, parentPath = ',', level = 0) {
    if (!children || children.length === 0) return;
    
    for (const item of children) {
      // Create the node
      const node = new SyllabusNode({
        name: item.name,
        code: item.code.toUpperCase(),
        type: item.type,
        parentId,
        path: parentPath,
        level,
        isActive: true,
        isCustom: false
      });
      
      await node.save();
      
      // Recursively seed its children
      if (item.children && item.children.length > 0) {
        const nextPath = `${parentPath}${node._id},`;
        await seedBranch(item.children, node._id, nextPath, level + 1);
      }
    }
  }
  
  console.log('[seeder] Seeding syllabus hierarchy...');
  await seedBranch(syllabusData);
  console.log('[seeder] Syllabus hierarchy seeded successfully.');
}

// Support running directly
if (process.argv[1] && process.argv[1].endsWith('seedSyllabus.js')) {
  async function runDirectly() {
    await connectDatabase();
    await seedSyllabus();
    await disconnectDatabase();
    process.exit(0);
  }
  
  runDirectly().catch(err => {
    console.error('[seeder] Seeding failed:', err);
    process.exit(1);
  });
}

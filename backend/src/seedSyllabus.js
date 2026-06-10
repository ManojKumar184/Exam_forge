import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { SyllabusNode } from './models/SyllabusNode.js';

/**
 * Seed data for the syllabus taxonomy.
 * Hierarchy: exam_pattern → class → subject → chapter → topic
 * No subtopics.
 *
 * Architecture is generic for all future subjects:
 * Physics, Chemistry, Mathematics, Biology
 */

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
              { name: 'Physical World', code: 'JEEM_C11_PHY_PW', type: 'chapter', children: [
                { name: 'Scope of Physics', code: 'JEEM_C11_PHY_PW_SCOPE', type: 'topic' },
                { name: 'Fundamental Forces', code: 'JEEM_C11_PHY_PW_FORCES', type: 'topic' },
                { name: 'Nature of Physical Laws', code: 'JEEM_C11_PHY_PW_NATURE', type: 'topic' },
                { name: 'Physics and Society', code: 'JEEM_C11_PHY_PW_SOCIETY', type: 'topic' },
              ]},
              { name: 'Units and Measurements', code: 'JEEM_C11_PHY_UM', type: 'chapter', children: [
                { name: 'Physical Quantities', code: 'JEEM_C11_PHY_UM_PQ', type: 'topic' },
                { name: 'SI Units', code: 'JEEM_C11_PHY_UM_SI', type: 'topic' },
                { name: 'Fundamental and Derived Units', code: 'JEEM_C11_PHY_UM_FDU', type: 'topic' },
                { name: 'Dimensional Analysis', code: 'JEEM_C11_PHY_UM_DA', type: 'topic' },
                { name: 'Significant Figures', code: 'JEEM_C11_PHY_UM_SIG', type: 'topic' },
                { name: 'Errors in Measurement', code: 'JEEM_C11_PHY_UM_ERRORS', type: 'topic' },
                { name: 'Precision and Accuracy', code: 'JEEM_C11_PHY_UM_PA', type: 'topic' },
              ]},
              { name: 'Motion in a Straight Line', code: 'JEEM_C11_PHY_MSL', type: 'chapter', children: [
                { name: 'Position and Displacement', code: 'JEEM_C11_PHY_MSL_PD', type: 'topic' },
                { name: 'Distance and Speed', code: 'JEEM_C11_PHY_MSL_DS', type: 'topic' },
                { name: 'Velocity', code: 'JEEM_C11_PHY_MSL_VEL', type: 'topic' },
                { name: 'Acceleration', code: 'JEEM_C11_PHY_MSL_ACC', type: 'topic' },
                { name: 'Equations of Motion', code: 'JEEM_C11_PHY_MSL_EOM', type: 'topic' },
                { name: 'Graphical Analysis', code: 'JEEM_C11_PHY_MSL_GRAPH', type: 'topic' },
                { name: 'Relative Motion', code: 'JEEM_C11_PHY_MSL_REL', type: 'topic' },
              ]},
              { name: 'Motion in a Plane', code: 'JEEM_C11_PHY_MP', type: 'chapter', children: [
                { name: 'Scalars and Vectors', code: 'JEEM_C11_PHY_MP_SV', type: 'topic' },
                { name: 'Vector Operations', code: 'JEEM_C11_PHY_MP_VO', type: 'topic' },
                { name: 'Projectile Motion', code: 'JEEM_C11_PHY_MP_PROJ', type: 'topic' },
                { name: 'Relative Velocity in 2D', code: 'JEEM_C11_PHY_MP_RV2D', type: 'topic' },
                { name: 'Circular Motion', code: 'JEEM_C11_PHY_MP_CM', type: 'topic' },
              ]},
              { name: 'Laws of Motion', code: 'JEEM_C11_PHY_LOM', type: 'chapter', children: [
                { name: "Newton's First Law and Inertia", code: 'JEEM_C11_PHY_LOM_N1', type: 'topic' },
                { name: "Newton's Second Law and Momentum", code: 'JEEM_C11_PHY_LOM_N2', type: 'topic' },
                { name: "Newton's Third Law", code: 'JEEM_C11_PHY_LOM_N3', type: 'topic' },
                { name: 'Friction', code: 'JEEM_C11_PHY_LOM_FRIC', type: 'topic' },
                { name: 'Circular Motion Dynamics', code: 'JEEM_C11_PHY_LOM_CMD', type: 'topic' },
              ]},
              { name: 'Work, Energy and Power', code: 'JEEM_C11_PHY_WEP', type: 'chapter', children: [
                { name: 'Work', code: 'JEEM_C11_PHY_WEP_WORK', type: 'topic' },
                { name: 'Kinetic Energy', code: 'JEEM_C11_PHY_WEP_KE', type: 'topic' },
                { name: 'Potential Energy', code: 'JEEM_C11_PHY_WEP_PE', type: 'topic' },
                { name: 'Power', code: 'JEEM_C11_PHY_WEP_POWER', type: 'topic' },
                { name: 'Conservation of Energy', code: 'JEEM_C11_PHY_WEP_COE', type: 'topic' },
              ]},
              { name: 'System of Particles and Rotational Motion', code: 'JEEM_C11_PHY_SPRM', type: 'chapter', children: [
                { name: 'Center of Mass', code: 'JEEM_C11_PHY_SPRM_COM', type: 'topic' },
                { name: 'Conservation of Linear Momentum', code: 'JEEM_C11_PHY_SPRM_CLM', type: 'topic' },
                { name: 'Torque', code: 'JEEM_C11_PHY_SPRM_TORQ', type: 'topic' },
                { name: 'Angular Momentum', code: 'JEEM_C11_PHY_SPRM_AM', type: 'topic' },
                { name: 'Rotational Dynamics', code: 'JEEM_C11_PHY_SPRM_RD', type: 'topic' },
                { name: 'Moment of Inertia', code: 'JEEM_C11_PHY_SPRM_MOI', type: 'topic' },
              ]},
              { name: 'Gravitation', code: 'JEEM_C11_PHY_GRV', type: 'chapter', children: [
                { name: 'Universal Law of Gravitation', code: 'JEEM_C11_PHY_GRV_ULG', type: 'topic' },
                { name: 'Gravitational Field', code: 'JEEM_C11_PHY_GRV_GF', type: 'topic' },
                { name: 'Gravitational Potential', code: 'JEEM_C11_PHY_GRV_GP', type: 'topic' },
                { name: 'Escape Velocity', code: 'JEEM_C11_PHY_GRV_EV', type: 'topic' },
                { name: 'Satellites and Orbital Motion', code: 'JEEM_C11_PHY_GRV_SAT', type: 'topic' },
                { name: "Kepler's Laws", code: 'JEEM_C11_PHY_GRV_KEP', type: 'topic' },
              ]},
              { name: 'Mechanical Properties of Solids', code: 'JEEM_C11_PHY_MPS', type: 'chapter', children: [
                { name: 'Stress', code: 'JEEM_C11_PHY_MPS_STRESS', type: 'topic' },
                { name: 'Strain', code: 'JEEM_C11_PHY_MPS_STRAIN', type: 'topic' },
                { name: "Hooke's Law and Elasticity", code: 'JEEM_C11_PHY_MPS_ELAS', type: 'topic' },
                { name: "Young's Modulus", code: 'JEEM_C11_PHY_MPS_YM', type: 'topic' },
                { name: 'Bulk Modulus', code: 'JEEM_C11_PHY_MPS_BM', type: 'topic' },
                { name: 'Shear Modulus', code: 'JEEM_C11_PHY_MPS_SM', type: 'topic' },
              ]},
              { name: 'Mechanical Properties of Fluids', code: 'JEEM_C11_PHY_MPF', type: 'chapter', children: [
                { name: 'Pressure', code: 'JEEM_C11_PHY_MPF_PRESS', type: 'topic' },
                { name: "Pascal's Law", code: 'JEEM_C11_PHY_MPF_PASCAL', type: 'topic' },
                { name: "Archimedes' Principle and Buoyancy", code: 'JEEM_C11_PHY_MPF_ARCH', type: 'topic' },
                { name: "Bernoulli's Principle", code: 'JEEM_C11_PHY_MPF_BERN', type: 'topic' },
                { name: 'Surface Tension', code: 'JEEM_C11_PHY_MPF_ST', type: 'topic' },
                { name: 'Viscosity', code: 'JEEM_C11_PHY_MPF_VISC', type: 'topic' },
              ]},
              { name: 'Thermal Properties of Matter', code: 'JEEM_C11_PHY_TPM', type: 'chapter', children: [
                { name: 'Temperature and Heat', code: 'JEEM_C11_PHY_TPM_TEMP', type: 'topic' },
                { name: 'Thermal Expansion', code: 'JEEM_C11_PHY_TPM_TE', type: 'topic' },
                { name: 'Calorimetry', code: 'JEEM_C11_PHY_TPM_CAL', type: 'topic' },
                { name: 'Heat Transfer: Conduction', code: 'JEEM_C11_PHY_TPM_COND', type: 'topic' },
                { name: 'Heat Transfer: Convection', code: 'JEEM_C11_PHY_TPM_CONV', type: 'topic' },
                { name: 'Heat Transfer: Radiation', code: 'JEEM_C11_PHY_TPM_RAD', type: 'topic' },
              ]},
              { name: 'Thermodynamics', code: 'JEEM_C11_PHY_THD', type: 'chapter', children: [
                { name: 'Thermal Equilibrium', code: 'JEEM_C11_PHY_THD_EQ', type: 'topic' },
                { name: 'First Law of Thermodynamics', code: 'JEEM_C11_PHY_THD_FIRST', type: 'topic' },
                { name: 'Second Law of Thermodynamics', code: 'JEEM_C11_PHY_THD_SECOND', type: 'topic' },
                { name: 'Heat Engines and Refrigerators', code: 'JEEM_C11_PHY_THD_ENG', type: 'topic' },
                { name: 'Thermodynamic Processes', code: 'JEEM_C11_PHY_THD_PROCS', type: 'topic' },
              ]},
              { name: 'Kinetic Theory', code: 'JEEM_C11_PHY_KT', type: 'chapter', children: [
                { name: 'Molecular Nature of Matter', code: 'JEEM_C11_PHY_KT_MOL', type: 'topic' },
                { name: 'Ideal Gas Equation', code: 'JEEM_C11_PHY_KT_IGE', type: 'topic' },
                { name: 'Degrees of Freedom', code: 'JEEM_C11_PHY_KT_DOF', type: 'topic' },
                { name: 'Mean Free Path', code: 'JEEM_C11_PHY_KT_MFP', type: 'topic' },
              ]},
              { name: 'Oscillations', code: 'JEEM_C11_PHY_OSC', type: 'chapter', children: [
                { name: 'Simple Harmonic Motion', code: 'JEEM_C11_PHY_OSC_SHM', type: 'topic' },
                { name: 'Energy in SHM', code: 'JEEM_C11_PHY_OSC_ENERGY', type: 'topic' },
                { name: 'Damped Oscillations', code: 'JEEM_C11_PHY_OSC_DAMP', type: 'topic' },
                { name: 'Forced Oscillations and Resonance', code: 'JEEM_C11_PHY_OSC_FORCED', type: 'topic' },
              ]},
              { name: 'Waves', code: 'JEEM_C11_PHY_WAV', type: 'chapter', children: [
                { name: 'Wave Motion', code: 'JEEM_C11_PHY_WAV_MOTION', type: 'topic' },
                { name: 'Sound Waves', code: 'JEEM_C11_PHY_WAV_SOUND', type: 'topic' },
                { name: 'Doppler Effect', code: 'JEEM_C11_PHY_WAV_DOPPLER', type: 'topic' },
                { name: 'Standing Waves', code: 'JEEM_C11_PHY_WAV_STANDING', type: 'topic' },
                { name: 'Beats', code: 'JEEM_C11_PHY_WAV_BEATS', type: 'topic' },
              ]},
            ],
          },
          {
            name: 'Chemistry',
            code: 'JEEM_C11_CHM',
            type: 'subject',
            children: [
              { name: 'Some Basic Concepts of Chemistry', code: 'JEEM_C11_CHM_SBC', type: 'chapter', children: [
                { name: 'Mole Concept', code: 'JEEM_C11_CHM_SBC_MOLE', type: 'topic' },
                { name: 'Atomic and Molecular Masses', code: 'JEEM_C11_CHM_SBC_AMM', type: 'topic' },
                { name: 'Stoichiometry', code: 'JEEM_C11_CHM_SBC_STOICH', type: 'topic' },
                { name: 'Percentage Composition', code: 'JEEM_C11_CHM_SBC_PCT', type: 'topic' },
                { name: 'Empirical and Molecular Formulas', code: 'JEEM_C11_CHM_SBC_EMF', type: 'topic' },
                { name: 'Concentration Terms', code: 'JEEM_C11_CHM_SBC_CONC', type: 'topic' },
              ]},
              { name: 'Structure of Atom', code: 'JEEM_C11_CHM_SOA', type: 'chapter', children: [
                { name: 'Atomic Models', code: 'JEEM_C11_CHM_SOA_MODELS', type: 'topic' },
                { name: 'Quantum Numbers', code: 'JEEM_C11_CHM_SOA_QN', type: 'topic' },
                { name: 'Electronic Configuration', code: 'JEEM_C11_CHM_SOA_EC', type: 'topic' },
                { name: 'Aufbau and Hund Rules', code: 'JEEM_C11_CHM_SOA_AUFBAU', type: 'topic' },
                { name: 'de Broglie and Heisenberg', code: 'JEEM_C11_CHM_SOA_DB', type: 'topic' },
              ]},
              { name: 'Classification of Elements and Periodicity', code: 'JEEM_C11_CHM_COEP', type: 'chapter', children: [
                { name: 'Periodic Table', code: 'JEEM_C11_CHM_COEP_PT', type: 'topic' },
                { name: 'Periodic Trends', code: 'JEEM_C11_CHM_COEP_TRENDS', type: 'topic' },
                { name: 'Ionization Energy', code: 'JEEM_C11_CHM_COEP_IE', type: 'topic' },
                { name: 'Electronegativity', code: 'JEEM_C11_CHM_COEP_EN', type: 'topic' },
              ]},
              { name: 'Chemical Bonding and Molecular Structure', code: 'JEEM_C11_CHM_CBMS', type: 'chapter', children: [
                { name: 'Ionic Bond', code: 'JEEM_C11_CHM_CBMS_IONIC', type: 'topic' },
                { name: 'Covalent Bond', code: 'JEEM_C11_CHM_CBMS_COVALENT', type: 'topic' },
                { name: 'VSEPR Theory', code: 'JEEM_C11_CHM_CBMS_VSEPR', type: 'topic' },
                { name: 'Hybridization', code: 'JEEM_C11_CHM_CBMS_HYBRID', type: 'topic' },
                { name: 'Molecular Orbital Theory', code: 'JEEM_C11_CHM_CBMS_MOT', type: 'topic' },
                { name: 'Resonance', code: 'JEEM_C11_CHM_CBMS_RES', type: 'topic' },
              ]},
              { name: 'States of Matter', code: 'JEEM_C11_CHM_SOM', type: 'chapter', children: [
                { name: 'Gas Laws', code: 'JEEM_C11_CHM_SOM_GAS', type: 'topic' },
                { name: 'Ideal Gas Equation', code: 'JEEM_C11_CHM_SOM_IGE', type: 'topic' },
                { name: 'van der Waals Equation', code: 'JEEM_C11_CHM_SOM_VDW', type: 'topic' },
                { name: 'Liquid State', code: 'JEEM_C11_CHM_SOM_LIQ', type: 'topic' },
              ]},
              { name: 'Thermodynamics', code: 'JEEM_C11_CHM_THD', type: 'chapter', children: [
                { name: 'First Law of Thermodynamics', code: 'JEEM_C11_CHM_THD_FIRST', type: 'topic' },
                { name: 'Enthalpy', code: 'JEEM_C11_CHM_THD_ENTH', type: 'topic' },
                { name: 'Hess Law', code: 'JEEM_C11_CHM_THD_HESS', type: 'topic' },
                { name: 'Entropy and Gibbs Energy', code: 'JEEM_C11_CHM_THD_ENTROPY', type: 'topic' },
              ]},
              { name: 'Equilibrium', code: 'JEEM_C11_CHM_EQ', type: 'chapter', children: [
                { name: 'Chemical Equilibrium', code: 'JEEM_C11_CHM_EQ_CHEM', type: 'topic' },
                { name: 'Ionic Equilibrium', code: 'JEEM_C11_CHM_EQ_IONIC', type: 'topic' },
                { name: 'pH and Buffer Solutions', code: 'JEEM_C11_CHM_EQ_PH', type: 'topic' },
                { name: 'Solubility Product', code: 'JEEM_C11_CHM_EQ_KSP', type: 'topic' },
              ]},
              { name: 'Redox Reactions', code: 'JEEM_C11_CHM_REDOX', type: 'chapter', children: [
                { name: 'Oxidation Numbers', code: 'JEEM_C11_CHM_REDOX_ON', type: 'topic' },
                { name: 'Balancing Redox Equations', code: 'JEEM_C11_CHM_REDOX_BAL', type: 'topic' },
                { name: 'Electrochemical Cells', code: 'JEEM_C11_CHM_REDOX_EC', type: 'topic' },
              ]},
              { name: 'Organic Chemistry - Basic Principles', code: 'JEEM_C11_CHM_OCBP', type: 'chapter', children: [
                { name: 'Classification of Organic Compounds', code: 'JEEM_C11_CHM_OCBP_CLASS', type: 'topic' },
                { name: 'IUPAC Nomenclature', code: 'JEEM_C11_CHM_OCBP_IUPAC', type: 'topic' },
                { name: 'Isomerism', code: 'JEEM_C11_CHM_OCBP_ISO', type: 'topic' },
                { name: 'Reaction Mechanisms', code: 'JEEM_C11_CHM_OCBP_MECH', type: 'topic' },
                { name: 'Inductive Effect', code: 'JEEM_C11_CHM_OCBP_IE', type: 'topic' },
                { name: 'Resonance and Hyperconjugation', code: 'JEEM_C11_CHM_OCBP_RES', type: 'topic' },
              ]},
              { name: 'Hydrocarbons', code: 'JEEM_C11_CHM_HC', type: 'chapter', children: [
                { name: 'Alkanes', code: 'JEEM_C11_CHM_HC_ALKANES', type: 'topic' },
                { name: 'Alkenes', code: 'JEEM_C11_CHM_HC_ALKENES', type: 'topic' },
                { name: 'Alkynes', code: 'JEEM_C11_CHM_HC_ALKYNES', type: 'topic' },
                { name: 'Aromatic Hydrocarbons', code: 'JEEM_C11_CHM_HC_AROM', type: 'topic' },
              ]},
            ],
          },
          {
            name: 'Mathematics',
            code: 'JEEM_C11_MTH',
            type: 'subject',
            children: [
              { name: 'Sets and Functions', code: 'JEEM_C11_MTH_SF', type: 'chapter', children: [
                { name: 'Sets and Their Representations', code: 'JEEM_C11_MTH_SF_SETS', type: 'topic' },
                { name: 'Venn Diagrams', code: 'JEEM_C11_MTH_SF_VENN', type: 'topic' },
                { name: 'Relations', code: 'JEEM_C11_MTH_SF_REL', type: 'topic' },
                { name: 'Functions', code: 'JEEM_C11_MTH_SF_FUNC', type: 'topic' },
                { name: 'Domain and Range', code: 'JEEM_C11_MTH_SF_DR', type: 'topic' },
              ]},
              { name: 'Trigonometric Functions', code: 'JEEM_C11_MTH_TRIG', type: 'chapter', children: [
                { name: 'Trigonometric Ratios', code: 'JEEM_C11_MTH_TRIG_RATIOS', type: 'topic' },
                { name: 'Trigonometric Identities', code: 'JEEM_C11_MTH_TRIG_ID', type: 'topic' },
                { name: 'Trigonometric Equations', code: 'JEEM_C11_MTH_TRIG_EQ', type: 'topic' },
                { name: 'Inverse Trigonometric Functions', code: 'JEEM_C11_MTH_TRIG_INV', type: 'topic' },
              ]},
              { name: 'Complex Numbers and Quadratic Equations', code: 'JEEM_C11_MTH_CNQE', type: 'chapter', children: [
                { name: 'Complex Numbers', code: 'JEEM_C11_MTH_CNQE_CN', type: 'topic' },
                { name: 'De Moivre Theorem', code: 'JEEM_C11_MTH_CNQE_DM', type: 'topic' },
                { name: 'Quadratic Equations', code: 'JEEM_C11_MTH_CNQE_QE', type: 'topic' },
                { name: 'Nature of Roots', code: 'JEEM_C11_MTH_CNQE_NR', type: 'topic' },
              ]},
              { name: 'Permutations and Combinations', code: 'JEEM_C11_MTH_PC', type: 'chapter', children: [
                { name: 'Fundamental Principle of Counting', code: 'JEEM_C11_MTH_PC_FPC', type: 'topic' },
                { name: 'Permutations', code: 'JEEM_C11_MTH_PC_PERM', type: 'topic' },
                { name: 'Combinations', code: 'JEEM_C11_MTH_PC_COMB', type: 'topic' },
                { name: 'Binomial Theorem', code: 'JEEM_C11_MTH_PC_BT', type: 'topic' },
              ]},
              { name: 'Sequence and Series', code: 'JEEM_C11_MTH_SS', type: 'chapter', children: [
                { name: 'Arithmetic Progression', code: 'JEEM_C11_MTH_SS_AP', type: 'topic' },
                { name: 'Geometric Progression', code: 'JEEM_C11_MTH_SS_GP', type: 'topic' },
                { name: 'Harmonic Progression', code: 'JEEM_C11_MTH_SS_HP', type: 'topic' },
                { name: 'Special Series', code: 'JEEM_C11_MTH_SS_SPEC', type: 'topic' },
              ]},
              { name: 'Straight Lines and Conic Sections', code: 'JEEM_C11_MTH_SLCS', type: 'chapter', children: [
                { name: 'Coordinate Geometry', code: 'JEEM_C11_MTH_SLCS_CG', type: 'topic' },
                { name: 'Straight Lines', code: 'JEEM_C11_MTH_SLCS_SL', type: 'topic' },
                { name: 'Circles', code: 'JEEM_C11_MTH_SLCS_CIR', type: 'topic' },
                { name: 'Parabola', code: 'JEEM_C11_MTH_SLCS_PAR', type: 'topic' },
                { name: 'Ellipse', code: 'JEEM_C11_MTH_SLCS_ELL', type: 'topic' },
                { name: 'Hyperbola', code: 'JEEM_C11_MTH_SLCS_HYP', type: 'topic' },
              ]},
              { name: 'Limits and Derivatives', code: 'JEEM_C11_MTH_LD', type: 'chapter', children: [
                { name: 'Limits', code: 'JEEM_C11_MTH_LD_LIM', type: 'topic' },
                { name: 'Continuity', code: 'JEEM_C11_MTH_LD_CONT', type: 'topic' },
                { name: 'Differentiation', code: 'JEEM_C11_MTH_LD_DIFF', type: 'topic' },
                { name: 'Applications of Derivatives', code: 'JEEM_C11_MTH_LD_APP', type: 'topic' },
              ]},
              { name: 'Statistics and Probability', code: 'JEEM_C11_MTH_STP', type: 'chapter', children: [
                { name: 'Measures of Central Tendency', code: 'JEEM_C11_MTH_STP_CT', type: 'topic' },
                { name: 'Measures of Dispersion', code: 'JEEM_C11_MTH_STP_DISP', type: 'topic' },
                { name: 'Probability', code: 'JEEM_C11_MTH_STP_PROB', type: 'topic' },
                { name: 'Conditional Probability', code: 'JEEM_C11_MTH_STP_CP', type: 'topic' },
              ]},
            ],
          },
        ],
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
              { name: 'Electric Charges and Fields', code: 'JEEM_C12_PHY_ECF', type: 'chapter', children: [
                { name: 'Electric Charge', code: 'JEEM_C12_PHY_ECF_CHARGE', type: 'topic' },
                { name: "Coulomb's Law", code: 'JEEM_C12_PHY_ECF_COULOMB', type: 'topic' },
                { name: 'Electric Field', code: 'JEEM_C12_PHY_ECF_EFIELD', type: 'topic' },
                { name: 'Electric Flux', code: 'JEEM_C12_PHY_ECF_FLUX', type: 'topic' },
                { name: "Gauss's Law", code: 'JEEM_C12_PHY_ECF_GAUSS', type: 'topic' },
                { name: 'Electric Dipole', code: 'JEEM_C12_PHY_ECF_DIPOLE', type: 'topic' },
                { name: 'Conductors and Insulators', code: 'JEEM_C12_PHY_ECF_CI', type: 'topic' },
              ]},
              { name: 'Electrostatic Potential and Capacitance', code: 'JEEM_C12_PHY_EPC', type: 'chapter', children: [
                { name: 'Electric Potential', code: 'JEEM_C12_PHY_EPC_POT', type: 'topic' },
                { name: 'Potential Energy', code: 'JEEM_C12_PHY_EPC_PE', type: 'topic' },
                { name: 'Equipotential Surfaces', code: 'JEEM_C12_PHY_EPC_ES', type: 'topic' },
                { name: 'Capacitors', code: 'JEEM_C12_PHY_EPC_CAP', type: 'topic' },
                { name: 'Dielectrics', code: 'JEEM_C12_PHY_EPC_DIEL', type: 'topic' },
                { name: 'Energy Stored in Capacitors', code: 'JEEM_C12_PHY_EPC_ENERGY', type: 'topic' },
              ]},
              { name: 'Current Electricity', code: 'JEEM_C12_PHY_CE', type: 'chapter', children: [
                { name: 'Electric Current', code: 'JEEM_C12_PHY_CE_CURRENT', type: 'topic' },
                { name: 'Drift Velocity', code: 'JEEM_C12_PHY_CE_DRIFT', type: 'topic' },
                { name: "Ohm's Law", code: 'JEEM_C12_PHY_CE_OHM', type: 'topic' },
                { name: 'Resistance and Resistivity', code: 'JEEM_C12_PHY_CE_RES', type: 'topic' },
                { name: "Kirchhoff's Laws", code: 'JEEM_C12_PHY_CE_KIRCH', type: 'topic' },
                { name: 'Wheatstone Bridge', code: 'JEEM_C12_PHY_CE_WHEAT', type: 'topic' },
                { name: 'Meter Bridge', code: 'JEEM_C12_PHY_CE_METER', type: 'topic' },
                { name: 'Potentiometer', code: 'JEEM_C12_PHY_CE_POT', type: 'topic' },
              ]},
              { name: 'Moving Charges and Magnetism', code: 'JEEM_C12_PHY_MCM', type: 'chapter', children: [
                { name: 'Lorentz Force', code: 'JEEM_C12_PHY_MCM_LF', type: 'topic' },
                { name: 'Magnetic Field', code: 'JEEM_C12_PHY_MCM_BFIELD', type: 'topic' },
                { name: 'Biot-Savart Law', code: 'JEEM_C12_PHY_MCM_BS', type: 'topic' },
                { name: "Ampere's Law", code: 'JEEM_C12_PHY_MCM_AMP', type: 'topic' },
                { name: 'Motion in Magnetic Field', code: 'JEEM_C12_PHY_MCM_MOTION', type: 'topic' },
                { name: 'Cyclotron', code: 'JEEM_C12_PHY_MCM_CYCLO', type: 'topic' },
              ]},
              { name: 'Magnetism and Matter', code: 'JEEM_C12_PHY_MM', type: 'chapter', children: [
                { name: 'Bar Magnets', code: 'JEEM_C12_PHY_MM_BAR', type: 'topic' },
                { name: "Earth's Magnetism", code: 'JEEM_C12_PHY_MM_EARTH', type: 'topic' },
                { name: 'Magnetic Materials', code: 'JEEM_C12_PHY_MM_MAT', type: 'topic' },
                { name: 'Diamagnetism', code: 'JEEM_C12_PHY_MM_DIA', type: 'topic' },
                { name: 'Paramagnetism', code: 'JEEM_C12_PHY_MM_PARA', type: 'topic' },
                { name: 'Ferromagnetism', code: 'JEEM_C12_PHY_MM_FERRO', type: 'topic' },
              ]},
              { name: 'Electromagnetic Induction', code: 'JEEM_C12_PHY_EMI', type: 'chapter', children: [
                { name: "Faraday's Law", code: 'JEEM_C12_PHY_EMI_FARADAY', type: 'topic' },
                { name: "Lenz's Law", code: 'JEEM_C12_PHY_EMI_LENZ', type: 'topic' },
                { name: 'Self Induction', code: 'JEEM_C12_PHY_EMI_SELF', type: 'topic' },
                { name: 'Mutual Induction', code: 'JEEM_C12_PHY_EMI_MUTUAL', type: 'topic' },
              ]},
              { name: 'Alternating Current', code: 'JEEM_C12_PHY_AC', type: 'chapter', children: [
                { name: 'AC Circuits', code: 'JEEM_C12_PHY_AC_CIR', type: 'topic' },
                { name: 'Reactance and Impedance', code: 'JEEM_C12_PHY_AC_REACT', type: 'topic' },
                { name: 'Resonance in AC Circuits', code: 'JEEM_C12_PHY_AC_RES', type: 'topic' },
                { name: 'Transformers', code: 'JEEM_C12_PHY_AC_TRANS', type: 'topic' },
              ]},
              { name: 'Electromagnetic Waves', code: 'JEEM_C12_PHY_EMW', type: 'chapter', children: [
                { name: 'Maxwell Theory', code: 'JEEM_C12_PHY_EMW_MAX', type: 'topic' },
                { name: 'Electromagnetic Spectrum', code: 'JEEM_C12_PHY_EMW_SPECTRUM', type: 'topic' },
                { name: 'Properties of EM Waves', code: 'JEEM_C12_PHY_EMW_PROP', type: 'topic' },
              ]},
              { name: 'Ray Optics and Optical Instruments', code: 'JEEM_C12_PHY_ROOI', type: 'chapter', children: [
                { name: 'Reflection of Light', code: 'JEEM_C12_PHY_ROOI_REFL', type: 'topic' },
                { name: 'Refraction of Light', code: 'JEEM_C12_PHY_ROOI_REFR', type: 'topic' },
                { name: 'Mirrors', code: 'JEEM_C12_PHY_ROOI_MIR', type: 'topic' },
                { name: 'Lenses', code: 'JEEM_C12_PHY_ROOI_LENS', type: 'topic' },
                { name: 'Optical Instruments', code: 'JEEM_C12_PHY_ROOI_OPT', type: 'topic' },
                { name: 'Total Internal Reflection', code: 'JEEM_C12_PHY_ROOI_TIR', type: 'topic' },
              ]},
              { name: 'Wave Optics', code: 'JEEM_C12_PHY_WO', type: 'chapter', children: [
                { name: "Huygens Principle", code: 'JEEM_C12_PHY_WO_HUYG', type: 'topic' },
                { name: 'Interference', code: 'JEEM_C12_PHY_WO_INTER', type: 'topic' },
                { name: 'Diffraction', code: 'JEEM_C12_PHY_WO_DIFF', type: 'topic' },
                { name: 'Polarization', code: 'JEEM_C12_PHY_WO_POL', type: 'topic' },
              ]},
              { name: 'Dual Nature of Radiation and Matter', code: 'JEEM_C12_PHY_DNRM', type: 'chapter', children: [
                { name: 'Photoelectric Effect', code: 'JEEM_C12_PHY_DNRM_PE', type: 'topic' },
                { name: 'Matter Waves', code: 'JEEM_C12_PHY_DNRM_MW', type: 'topic' },
                { name: 'de Broglie Hypothesis', code: 'JEEM_C12_PHY_DNRM_DB', type: 'topic' },
              ]},
              { name: 'Atoms', code: 'JEEM_C12_PHY_ATOMS', type: 'chapter', children: [
                { name: 'Rutherford Model', code: 'JEEM_C12_PHY_ATOMS_RUTH', type: 'topic' },
                { name: 'Bohr Model', code: 'JEEM_C12_PHY_ATOMS_BOHR', type: 'topic' },
                { name: 'Hydrogen Spectrum', code: 'JEEM_C12_PHY_ATOMS_HSPECT', type: 'topic' },
              ]},
              { name: 'Nuclei', code: 'JEEM_C12_PHY_NUC', type: 'chapter', children: [
                { name: 'Radioactivity', code: 'JEEM_C12_PHY_NUC_RAD', type: 'topic' },
                { name: 'Nuclear Reactions', code: 'JEEM_C12_PHY_NUC_REACT', type: 'topic' },
                { name: 'Binding Energy', code: 'JEEM_C12_PHY_NUC_BE', type: 'topic' },
                { name: 'Mass Defect', code: 'JEEM_C12_PHY_NUC_MD', type: 'topic' },
              ]},
              { name: 'Semiconductor Electronics', code: 'JEEM_C12_PHY_SE', type: 'chapter', children: [
                { name: 'Semiconductors', code: 'JEEM_C12_PHY_SE_SEMI', type: 'topic' },
                { name: 'PN Junction', code: 'JEEM_C12_PHY_SE_PN', type: 'topic' },
                { name: 'Diodes', code: 'JEEM_C12_PHY_SE_DIODE', type: 'topic' },
                { name: 'Transistors', code: 'JEEM_C12_PHY_SE_TRANS', type: 'topic' },
                { name: 'Logic Gates', code: 'JEEM_C12_PHY_SE_LOGIC', type: 'topic' },
                { name: 'Rectifiers', code: 'JEEM_C12_PHY_SE_RECT', type: 'topic' },
                { name: 'Zener Diode', code: 'JEEM_C12_PHY_SE_ZENER', type: 'topic' },
              ]},
            ],
          },
          {
            name: 'Chemistry',
            code: 'JEEM_C12_CHM',
            type: 'subject',
            children: [
              { name: 'Solid State', code: 'JEEM_C12_CHM_SS', type: 'chapter', children: [
                { name: 'Unit Cells', code: 'JEEM_C12_CHM_SS_UC', type: 'topic' },
                { name: 'Crystal Defects', code: 'JEEM_C12_CHM_SS_DEFECTS', type: 'topic' },
                { name: 'Close Packing', code: 'JEEM_C12_CHM_SS_CP', type: 'topic' },
              ]},
              { name: 'Solutions', code: 'JEEM_C12_CHM_SOL', type: 'chapter', children: [
                { name: 'Solution Concentration', code: 'JEEM_C12_CHM_SOL_CONC', type: 'topic' },
                { name: 'Colligative Properties', code: 'JEEM_C12_CHM_SOL_COLLIG', type: 'topic' },
                { name: 'Raoult Law', code: 'JEEM_C12_CHM_SOL_RAOULT', type: 'topic' },
                { name: 'Vapour Pressure', code: 'JEEM_C12_CHM_SOL_VP', type: 'topic' },
              ]},
              { name: 'Electrochemistry', code: 'JEEM_C12_CHM_EC', type: 'chapter', children: [
                { name: 'Electrochemical Cells', code: 'JEEM_C12_CHM_EC_CELLS', type: 'topic' },
                { name: 'Nernst Equation', code: 'JEEM_C12_CHM_EC_NERNST', type: 'topic' },
                { name: 'Electrolysis', code: 'JEEM_C12_CHM_EC_ELEC', type: 'topic' },
                { name: 'Faraday Laws', code: 'JEEM_C12_CHM_EC_FARADAY', type: 'topic' },
                { name: 'Conductance', code: 'JEEM_C12_CHM_EC_COND', type: 'topic' },
              ]},
              { name: 'Chemical Kinetics', code: 'JEEM_C12_CHM_CK', type: 'chapter', children: [
                { name: 'Rate of Reaction', code: 'JEEM_C12_CHM_CK_RATE', type: 'topic' },
                { name: 'Order and Molecularity', code: 'JEEM_C12_CHM_CK_ORDER', type: 'topic' },
                { name: 'Activation Energy', code: 'JEEM_C12_CHM_CK_EA', type: 'topic' },
                { name: 'Integrated Rate Laws', code: 'JEEM_C12_CHM_CK_IRL', type: 'topic' },
              ]},
              { name: 'Surface Chemistry', code: 'JEEM_C12_CHM_SC', type: 'chapter', children: [
                { name: 'Adsorption', code: 'JEEM_C12_CHM_SC_ADS', type: 'topic' },
                { name: 'Catalysis', code: 'JEEM_C12_CHM_SC_CAT', type: 'topic' },
                { name: 'Colloids', code: 'JEEM_C12_CHM_SC_COLL', type: 'topic' },
              ]},
              { name: 'p-Block Elements', code: 'JEEM_C12_CHM_PBLK', type: 'chapter', children: [
                { name: 'Group 15 Elements', code: 'JEEM_C12_CHM_PBLK_G15', type: 'topic' },
                { name: 'Group 16 Elements', code: 'JEEM_C12_CHM_PBLK_G16', type: 'topic' },
                { name: 'Group 17 Elements', code: 'JEEM_C12_CHM_PBLK_G17', type: 'topic' },
                { name: 'Group 18 Elements', code: 'JEEM_C12_CHM_PBLK_G18', type: 'topic' },
              ]},
              { name: 'd and f Block Elements', code: 'JEEM_C12_CHM_DF', type: 'chapter', children: [
                { name: 'Transition Elements', code: 'JEEM_C12_CHM_DF_TRANS', type: 'topic' },
                { name: 'Lanthanoids and Actinoids', code: 'JEEM_C12_CHM_DF_LN', type: 'topic' },
              ]},
              { name: 'Coordination Compounds', code: 'JEEM_C12_CHM_CC', type: 'chapter', children: [
                { name: 'Werner Theory', code: 'JEEM_C12_CHM_CC_WERNER', type: 'topic' },
                { name: 'Nomenclature', code: 'JEEM_C12_CHM_CC_NOMEN', type: 'topic' },
                { name: 'Valence Bond Theory', code: 'JEEM_C12_CHM_CC_VBT', type: 'topic' },
                { name: 'Crystal Field Theory', code: 'JEEM_C12_CHM_CC_CFT', type: 'topic' },
              ]},
              { name: 'Haloalkanes and Haloarenes', code: 'JEEM_C12_CHM_HA', type: 'chapter', children: [
                { name: 'Haloalkanes', code: 'JEEM_C12_CHM_HA_ALKANES', type: 'topic' },
                { name: 'Haloarenes', code: 'JEEM_C12_CHM_HA_ARENES', type: 'topic' },
                { name: 'SN1 and SN2 Reactions', code: 'JEEM_C12_CHM_HA_SN', type: 'topic' },
              ]},
              { name: 'Alcohols, Phenols and Ethers', code: 'JEEM_C12_CHM_APE', type: 'chapter', children: [
                { name: 'Alcohols', code: 'JEEM_C12_CHM_APE_ALC', type: 'topic' },
                { name: 'Phenols', code: 'JEEM_C12_CHM_APE_PHEN', type: 'topic' },
                { name: 'Ethers', code: 'JEEM_C12_CHM_APE_ETH', type: 'topic' },
              ]},
              { name: 'Aldehydes, Ketones and Carboxylic Acids', code: 'JEEM_C12_CHM_AKCA', type: 'chapter', children: [
                { name: 'Aldehydes and Ketones', code: 'JEEM_C12_CHM_AKCA_AK', type: 'topic' },
                { name: 'Carboxylic Acids', code: 'JEEM_C12_CHM_AKCA_CA', type: 'topic' },
                { name: 'Nucleophilic Addition', code: 'JEEM_C12_CHM_AKCA_NA', type: 'topic' },
              ]},
              { name: 'Amines', code: 'JEEM_C12_CHM_AM', type: 'chapter', children: [
                { name: 'Structure of Amines', code: 'JEEM_C12_CHM_AM_STRUCT', type: 'topic' },
                { name: 'Basicity of Amines', code: 'JEEM_C12_CHM_AM_BASE', type: 'topic' },
                { name: 'Diazonium Salts', code: 'JEEM_C12_CHM_AM_DIAZO', type: 'topic' },
              ]},
              { name: 'Biomolecules', code: 'JEEM_C12_CHM_BIO', type: 'chapter', children: [
                { name: 'Carbohydrates', code: 'JEEM_C12_CHM_BIO_CARB', type: 'topic' },
                { name: 'Proteins', code: 'JEEM_C12_CHM_BIO_PROT', type: 'topic' },
                { name: 'Nucleic Acids', code: 'JEEM_C12_CHM_BIO_NA', type: 'topic' },
                { name: 'Enzymes', code: 'JEEM_C12_CHM_BIO_ENZ', type: 'topic' },
              ]},
            ],
          },
          {
            name: 'Mathematics',
            code: 'JEEM_C12_MTH',
            type: 'subject',
            children: [
              { name: 'Relations and Functions', code: 'JEEM_C12_MTH_RF', type: 'chapter', children: [
                { name: 'Types of Relations', code: 'JEEM_C12_MTH_RF_REL', type: 'topic' },
                { name: 'Types of Functions', code: 'JEEM_C12_MTH_RF_FUNC', type: 'topic' },
                { name: 'Composite Functions', code: 'JEEM_C12_MTH_RF_COMP', type: 'topic' },
                { name: 'Inverse Functions', code: 'JEEM_C12_MTH_RF_INV', type: 'topic' },
              ]},
              { name: 'Inverse Trigonometric Functions', code: 'JEEM_C12_MTH_ITF', type: 'chapter', children: [
                { name: 'Principal Values', code: 'JEEM_C12_MTH_ITF_PV', type: 'topic' },
                { name: 'Properties of ITF', code: 'JEEM_C12_MTH_ITF_PROP', type: 'topic' },
                { name: 'ITF Equations', code: 'JEEM_C12_MTH_ITF_EQ', type: 'topic' },
              ]},
              { name: 'Matrices', code: 'JEEM_C12_MTH_MAT', type: 'chapter', children: [
                { name: 'Types of Matrices', code: 'JEEM_C12_MTH_MAT_TYPES', type: 'topic' },
                { name: 'Matrix Operations', code: 'JEEM_C12_MTH_MAT_OPS', type: 'topic' },
                { name: 'Determinants', code: 'JEEM_C12_MTH_MAT_DET', type: 'topic' },
                { name: 'Inverse of a Matrix', code: 'JEEM_C12_MTH_MAT_INV', type: 'topic' },
                { name: 'Cramers Rule', code: 'JEEM_C12_MTH_MAT_CRAMER', type: 'topic' },
              ]},
              { name: 'Continuity and Differentiability', code: 'JEEM_C12_MTH_CD', type: 'chapter', children: [
                { name: 'Continuity', code: 'JEEM_C12_MTH_CD_CONT', type: 'topic' },
                { name: 'Differentiability', code: 'JEEM_C12_MTH_CD_DIFF', type: 'topic' },
                { name: 'Rolle and Lagrange Theorems', code: 'JEEM_C12_MTH_CD_MVT', type: 'topic' },
                { name: 'L Hospitals Rule', code: 'JEEM_C12_MTH_CD_LH', type: 'topic' },
              ]},
              { name: 'Application of Derivatives', code: 'JEEM_C12_MTH_AD', type: 'chapter', children: [
                { name: 'Rate of Change', code: 'JEEM_C12_MTH_AD_ROC', type: 'topic' },
                { name: 'Increasing and Decreasing Functions', code: 'JEEM_C12_MTH_AD_ID', type: 'topic' },
                { name: 'Tangents and Normals', code: 'JEEM_C12_MTH_AD_TN', type: 'topic' },
                { name: 'Maxima and Minima', code: 'JEEM_C12_MTH_AD_MM', type: 'topic' },
              ]},
              { name: 'Integrals', code: 'JEEM_C12_MTH_INT', type: 'chapter', children: [
                { name: 'Indefinite Integrals', code: 'JEEM_C12_MTH_INT_INDEF', type: 'topic' },
                { name: 'Definite Integrals', code: 'JEEM_C12_MTH_INT_DEF', type: 'topic' },
                { name: 'Integration by Substitution', code: 'JEEM_C12_MTH_INT_SUBST', type: 'topic' },
                { name: 'Integration by Parts', code: 'JEEM_C12_MTH_INT_PARTS', type: 'topic' },
                { name: 'Area Under Curves', code: 'JEEM_C12_MTH_INT_AREA', type: 'topic' },
              ]},
              { name: 'Differential Equations', code: 'JEEM_C12_MTH_DE', type: 'chapter', children: [
                { name: 'Order and Degree', code: 'JEEM_C12_MTH_DE_OD', type: 'topic' },
                { name: 'Variable Separable', code: 'JEEM_C12_MTH_DE_VS', type: 'topic' },
                { name: 'Homogeneous Equations', code: 'JEEM_C12_MTH_DE_HOM', type: 'topic' },
                { name: 'Linear Differential Equations', code: 'JEEM_C12_MTH_DE_LIN', type: 'topic' },
              ]},
              { name: 'Vector Algebra', code: 'JEEM_C12_MTH_VA', type: 'chapter', children: [
                { name: 'Vectors and Scalars', code: 'JEEM_C12_MTH_VA_BASIC', type: 'topic' },
                { name: 'Dot Product', code: 'JEEM_C12_MTH_VA_DOT', type: 'topic' },
                { name: 'Cross Product', code: 'JEEM_C12_MTH_VA_CROSS', type: 'topic' },
                { name: 'Scalar Triple Product', code: 'JEEM_C12_MTH_VA_STP', type: 'topic' },
              ]},
              { name: 'Three Dimensional Geometry', code: 'JEEM_C12_MTH_3DG', type: 'chapter', children: [
                { name: 'Direction Cosines', code: 'JEEM_C12_MTH_3DG_DC', type: 'topic' },
                { name: 'Equation of Lines', code: 'JEEM_C12_MTH_3DG_LINES', type: 'topic' },
                { name: 'Equation of Planes', code: 'JEEM_C12_MTH_3DG_PLANES', type: 'topic' },
                { name: 'Distance Formulas', code: 'JEEM_C12_MTH_3DG_DIST', type: 'topic' },
              ]},
              { name: 'Probability', code: 'JEEM_C12_MTH_PROB', type: 'chapter', children: [
                { name: 'Conditional Probability', code: 'JEEM_C12_MTH_PROB_CP', type: 'topic' },
                { name: 'Bayes Theorem', code: 'JEEM_C12_MTH_PROB_BAYES', type: 'topic' },
                { name: 'Random Variables', code: 'JEEM_C12_MTH_PROB_RV', type: 'topic' },
                { name: 'Binomial Distribution', code: 'JEEM_C12_MTH_PROB_BINOM', type: 'topic' },
              ]},
            ],
          },
        ],
      },
    ],
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
            name: 'Physics',
            code: 'NEET_C11_PHY',
            type: 'subject',
            children: [
              { name: 'Physical World and Measurement', code: 'NEET_C11_PHY_PWM', type: 'chapter', children: [
                { name: 'SI Units', code: 'NEET_C11_PHY_PWM_SI', type: 'topic' },
                { name: 'Dimensional Analysis', code: 'NEET_C11_PHY_PWM_DA', type: 'topic' },
                { name: 'Significant Figures', code: 'NEET_C11_PHY_PWM_SIG', type: 'topic' },
                { name: 'Errors in Measurement', code: 'NEET_C11_PHY_PWM_ERRORS', type: 'topic' },
              ]},
              { name: 'Kinematics', code: 'NEET_C11_PHY_KIN', type: 'chapter', children: [
                { name: 'Motion in 1D', code: 'NEET_C11_PHY_KIN_1D', type: 'topic' },
                { name: 'Motion in 2D', code: 'NEET_C11_PHY_KIN_2D', type: 'topic' },
                { name: 'Projectile Motion', code: 'NEET_C11_PHY_KIN_PROJ', type: 'topic' },
                { name: 'Relative Motion', code: 'NEET_C11_PHY_KIN_REL', type: 'topic' },
              ]},
              { name: 'Laws of Motion', code: 'NEET_C11_PHY_LOM', type: 'chapter', children: [
                { name: "Newton's Laws", code: 'NEET_C11_PHY_LOM_NL', type: 'topic' },
                { name: 'Friction', code: 'NEET_C11_PHY_LOM_FRIC', type: 'topic' },
                { name: 'Circular Motion', code: 'NEET_C11_PHY_LOM_CM', type: 'topic' },
              ]},
              { name: 'Work, Energy and Power', code: 'NEET_C11_PHY_WEP', type: 'chapter', children: [
                { name: 'Work and Energy', code: 'NEET_C11_PHY_WEP_WE', type: 'topic' },
                { name: 'Power', code: 'NEET_C11_PHY_WEP_POWER', type: 'topic' },
                { name: 'Conservation of Energy', code: 'NEET_C11_PHY_WEP_COE', type: 'topic' },
              ]},
              { name: 'Rotational Motion', code: 'NEET_C11_PHY_ROT', type: 'chapter', children: [
                { name: 'Center of Mass', code: 'NEET_C11_PHY_ROT_COM', type: 'topic' },
                { name: 'Moment of Inertia', code: 'NEET_C11_PHY_ROT_MOI', type: 'topic' },
                { name: 'Torque and Angular Momentum', code: 'NEET_C11_PHY_ROT_TAM', type: 'topic' },
              ]},
              { name: 'Gravitation', code: 'NEET_C11_PHY_GRV', type: 'chapter', children: [
                { name: "Newton's Law of Gravitation", code: 'NEET_C11_PHY_GRV_NLG', type: 'topic' },
                { name: 'Kepler Laws', code: 'NEET_C11_PHY_GRV_KEP', type: 'topic' },
                { name: 'Escape Velocity', code: 'NEET_C11_PHY_GRV_EV', type: 'topic' },
              ]},
              { name: 'Properties of Solids and Liquids', code: 'NEET_C11_PHY_PSL', type: 'chapter', children: [
                { name: 'Elasticity', code: 'NEET_C11_PHY_PSL_ELAS', type: 'topic' },
                { name: 'Fluid Mechanics', code: 'NEET_C11_PHY_PSL_FLUID', type: 'topic' },
                { name: 'Surface Tension', code: 'NEET_C11_PHY_PSL_ST', type: 'topic' },
                { name: 'Viscosity', code: 'NEET_C11_PHY_PSL_VISC', type: 'topic' },
              ]},
              { name: 'Thermodynamics', code: 'NEET_C11_PHY_THD', type: 'chapter', children: [
                { name: 'Thermal Equilibrium', code: 'NEET_C11_PHY_THD_EQ', type: 'topic' },
                { name: 'First Law of Thermodynamics', code: 'NEET_C11_PHY_THD_FIRST', type: 'topic' },
                { name: 'Heat Engines', code: 'NEET_C11_PHY_THD_ENG', type: 'topic' },
              ]},
              { name: 'Oscillations and Waves', code: 'NEET_C11_PHY_OSW', type: 'chapter', children: [
                { name: 'SHM', code: 'NEET_C11_PHY_OSW_SHM', type: 'topic' },
                { name: 'Wave Motion', code: 'NEET_C11_PHY_OSW_WAVE', type: 'topic' },
                { name: 'Sound Waves', code: 'NEET_C11_PHY_OSW_SOUND', type: 'topic' },
              ]},
            ],
          },
          {
            name: 'Chemistry',
            code: 'NEET_C11_CHM',
            type: 'subject',
            children: [
              { name: 'Basic Concepts of Chemistry', code: 'NEET_C11_CHM_BC', type: 'chapter', children: [
                { name: 'Mole Concept', code: 'NEET_C11_CHM_BC_MOLE', type: 'topic' },
                { name: 'Stoichiometry', code: 'NEET_C11_CHM_BC_STOICH', type: 'topic' },
              ]},
              { name: 'Atomic Structure', code: 'NEET_C11_CHM_AS', type: 'chapter', children: [
                { name: 'Quantum Numbers', code: 'NEET_C11_CHM_AS_QN', type: 'topic' },
                { name: 'Electronic Configuration', code: 'NEET_C11_CHM_AS_EC', type: 'topic' },
              ]},
              { name: 'Chemical Bonding', code: 'NEET_C11_CHM_CB', type: 'chapter', children: [
                { name: 'Ionic and Covalent Bonds', code: 'NEET_C11_CHM_CB_BONDS', type: 'topic' },
                { name: 'VSEPR Theory', code: 'NEET_C11_CHM_CB_VSEPR', type: 'topic' },
                { name: 'Hybridization', code: 'NEET_C11_CHM_CB_HYBRID', type: 'topic' },
                { name: 'Molecular Orbital Theory', code: 'NEET_C11_CHM_CB_MOT', type: 'topic' },
              ]},
              { name: 'Thermodynamics and Equilibrium', code: 'NEET_C11_CHM_TE', type: 'chapter', children: [
                { name: 'Chemical Thermodynamics', code: 'NEET_C11_CHM_TE_CT', type: 'topic' },
                { name: 'Chemical Equilibrium', code: 'NEET_C11_CHM_TE_CE', type: 'topic' },
                { name: 'Ionic Equilibrium', code: 'NEET_C11_CHM_TE_IE', type: 'topic' },
              ]},
              { name: 'Organic Chemistry Basics', code: 'NEET_C11_CHM_OCB', type: 'chapter', children: [
                { name: 'IUPAC Nomenclature', code: 'NEET_C11_CHM_OCB_IUPAC', type: 'topic' },
                { name: 'Isomerism', code: 'NEET_C11_CHM_OCB_ISO', type: 'topic' },
                { name: 'Reaction Mechanisms', code: 'NEET_C11_CHM_OCB_MECH', type: 'topic' },
              ]},
              { name: 'Hydrocarbons', code: 'NEET_C11_CHM_HC', type: 'chapter', children: [
                { name: 'Alkanes', code: 'NEET_C11_CHM_HC_ALKANES', type: 'topic' },
                { name: 'Alkenes and Alkynes', code: 'NEET_C11_CHM_HC_ALKENES', type: 'topic' },
              ]},
            ],
          },
          {
            name: 'Biology',
            code: 'NEET_C11_BIO',
            type: 'subject',
            children: [
              { name: 'Diversity in Living World', code: 'NEET_C11_BIO_DLW', type: 'chapter', children: [
                { name: 'Plant Kingdom', code: 'NEET_C11_BIO_DLW_PLANT', type: 'topic' },
                { name: 'Animal Kingdom', code: 'NEET_C11_BIO_DLW_ANIMAL', type: 'topic' },
                { name: 'Classification Systems', code: 'NEET_C11_BIO_DLW_CLASS', type: 'topic' },
              ]},
              { name: 'Structural Organization in Plants and Animals', code: 'NEET_C11_BIO_SOPA', type: 'chapter', children: [
                { name: 'Tissues', code: 'NEET_C11_BIO_SOPA_TISSUE', type: 'topic' },
                { name: 'Morphology of Flowering Plants', code: 'NEET_C11_BIO_SOPA_MORPH', type: 'topic' },
                { name: 'Anatomy of Flowering Plants', code: 'NEET_C11_BIO_SOPA_ANAT', type: 'topic' },
                { name: 'Animal Tissues', code: 'NEET_C11_BIO_SOPA_AT', type: 'topic' },
              ]},
              { name: 'Cell Structure and Function', code: 'NEET_C11_BIO_CSF', type: 'chapter', children: [
                { name: 'Cell Theory', code: 'NEET_C11_BIO_CSF_CT', type: 'topic' },
                { name: 'Cell Organelles', code: 'NEET_C11_BIO_CSF_ORG', type: 'topic' },
                { name: 'Cell Division', code: 'NEET_C11_BIO_CSF_DIV', type: 'topic' },
                { name: 'Biomolecules', code: 'NEET_C11_BIO_CSF_BIO', type: 'topic' },
              ]},
              { name: 'Plant Physiology', code: 'NEET_C11_BIO_PP', type: 'chapter', children: [
                { name: 'Photosynthesis', code: 'NEET_C11_BIO_PP_PHOTO', type: 'topic' },
                { name: 'Respiration', code: 'NEET_C11_BIO_PP_RESP', type: 'topic' },
                { name: 'Plant Growth and Hormones', code: 'NEET_C11_BIO_PP_GROWTH', type: 'topic' },
                { name: 'Transport in Plants', code: 'NEET_C11_BIO_PP_TRANS', type: 'topic' },
              ]},
              { name: 'Human Physiology', code: 'NEET_C11_BIO_HP', type: 'chapter', children: [
                { name: 'Digestion and Absorption', code: 'NEET_C11_BIO_HP_DIGEST', type: 'topic' },
                { name: 'Breathing and Exchange of Gases', code: 'NEET_C11_BIO_HP_BREATH', type: 'topic' },
                { name: 'Body Fluids and Circulation', code: 'NEET_C11_BIO_HP_BFC', type: 'topic' },
                { name: 'Excretory System', code: 'NEET_C11_BIO_HP_EXCRET', type: 'topic' },
                { name: 'Neural System', code: 'NEET_C11_BIO_HP_NEURAL', type: 'topic' },
                { name: 'Endocrine System', code: 'NEET_C11_BIO_HP_ENDOC', type: 'topic' },
                { name: 'Locomotion and Movement', code: 'NEET_C11_BIO_HP_LOCO', type: 'topic' },
              ]},
            ],
          },
        ],
      },
      {
        name: 'Class 12',
        code: 'NEET_C12',
        type: 'class',
        children: [
          {
            name: 'Physics',
            code: 'NEET_C12_PHY',
            type: 'subject',
            children: [
              { name: 'Electrostatics', code: 'NEET_C12_PHY_ELS', type: 'chapter', children: [
                { name: 'Electric Charges and Fields', code: 'NEET_C12_PHY_ELS_ECF', type: 'topic' },
                { name: "Coulomb's Law", code: 'NEET_C12_PHY_ELS_COUL', type: 'topic' },
                { name: 'Electric Potential', code: 'NEET_C12_PHY_ELS_POT', type: 'topic' },
                { name: 'Capacitors', code: 'NEET_C12_PHY_ELS_CAP', type: 'topic' },
              ]},
              { name: 'Current Electricity', code: 'NEET_C12_PHY_CE', type: 'chapter', children: [
                { name: 'Ohm Law', code: 'NEET_C12_PHY_CE_OHM', type: 'topic' },
                { name: 'Kirchhoff Laws', code: 'NEET_C12_PHY_CE_KIRCH', type: 'topic' },
                { name: 'Electrical Measurements', code: 'NEET_C12_PHY_CE_MEAS', type: 'topic' },
              ]},
              { name: 'Magnetism and EMI', code: 'NEET_C12_PHY_MEMI', type: 'chapter', children: [
                { name: 'Magnetism', code: 'NEET_C12_PHY_MEMI_MAG', type: 'topic' },
                { name: 'Electromagnetic Induction', code: 'NEET_C12_PHY_MEMI_EMI', type: 'topic' },
                { name: 'Alternating Current', code: 'NEET_C12_PHY_MEMI_AC', type: 'topic' },
              ]},
              { name: 'Optics', code: 'NEET_C12_PHY_OPT', type: 'chapter', children: [
                { name: 'Ray Optics', code: 'NEET_C12_PHY_OPT_RAY', type: 'topic' },
                { name: 'Wave Optics', code: 'NEET_C12_PHY_OPT_WAVE', type: 'topic' },
                { name: 'Optical Instruments', code: 'NEET_C12_PHY_OPT_INST', type: 'topic' },
              ]},
              { name: 'Modern Physics', code: 'NEET_C12_PHY_MOD', type: 'chapter', children: [
                { name: 'Dual Nature', code: 'NEET_C12_PHY_MOD_DUAL', type: 'topic' },
                { name: 'Atoms and Nuclei', code: 'NEET_C12_PHY_MOD_ATOM', type: 'topic' },
                { name: 'Semiconductors', code: 'NEET_C12_PHY_MOD_SEMI', type: 'topic' },
              ]},
            ],
          },
          {
            name: 'Chemistry',
            code: 'NEET_C12_CHM',
            type: 'subject',
            children: [
              { name: 'Solid State', code: 'NEET_C12_CHM_SS', type: 'chapter', children: [
                { name: 'Unit Cells and Packing', code: 'NEET_C12_CHM_SS_UC', type: 'topic' },
                { name: 'Crystal Defects', code: 'NEET_C12_CHM_SS_DEF', type: 'topic' },
              ]},
              { name: 'Solutions and Electrochemistry', code: 'NEET_C12_CHM_SE', type: 'chapter', children: [
                { name: 'Solutions and Colligative Properties', code: 'NEET_C12_CHM_SE_SOL', type: 'topic' },
                { name: 'Electrochemistry', code: 'NEET_C12_CHM_SE_EC', type: 'topic' },
                { name: 'Nernst Equation', code: 'NEET_C12_CHM_SE_NERNST', type: 'topic' },
              ]},
              { name: 'Chemical Kinetics', code: 'NEET_C12_CHM_CK', type: 'chapter', children: [
                { name: 'Rate of Reaction', code: 'NEET_C12_CHM_CK_RATE', type: 'topic' },
                { name: 'Activation Energy', code: 'NEET_C12_CHM_CK_EA', type: 'topic' },
              ]},
              { name: 'Coordination Compounds', code: 'NEET_C12_CHM_CC', type: 'chapter', children: [
                { name: 'Nomenclature', code: 'NEET_C12_CHM_CC_NOMEN', type: 'topic' },
                { name: 'Bonding in Complexes', code: 'NEET_C12_CHM_CC_BOND', type: 'topic' },
              ]},
              { name: 'Organic Compounds', code: 'NEET_C12_CHM_OC', type: 'chapter', children: [
                { name: 'Haloalkanes and Haloarenes', code: 'NEET_C12_CHM_OC_HA', type: 'topic' },
                { name: 'Alcohols, Phenols and Ethers', code: 'NEET_C12_CHM_OC_APE', type: 'topic' },
                { name: 'Aldehydes, Ketones and Acids', code: 'NEET_C12_CHM_OC_AKA', type: 'topic' },
                { name: 'Amines and Biomolecules', code: 'NEET_C12_CHM_OC_AB', type: 'topic' },
              ]},
            ],
          },
          {
            name: 'Biology',
            code: 'NEET_C12_BIO',
            type: 'subject',
            children: [
              { name: 'Reproduction', code: 'NEET_C12_BIO_REP', type: 'chapter', children: [
                { name: 'Reproduction in Organisms', code: 'NEET_C12_BIO_REP_ORG', type: 'topic' },
                { name: 'Sexual Reproduction in Plants', code: 'NEET_C12_BIO_REP_PLANT', type: 'topic' },
                { name: 'Human Reproduction', code: 'NEET_C12_BIO_REP_HUMAN', type: 'topic' },
                { name: 'Reproductive Health', code: 'NEET_C12_BIO_REP_HEALTH', type: 'topic' },
              ]},
              { name: 'Genetics and Evolution', code: 'NEET_C12_BIO_GE', type: 'chapter', children: [
                { name: 'Mendelian Genetics', code: 'NEET_C12_BIO_GE_MENDEL', type: 'topic' },
                { name: 'Molecular Basis of Inheritance', code: 'NEET_C12_BIO_GE_MOLEC', type: 'topic' },
                { name: 'Evolution', code: 'NEET_C12_BIO_GE_EVOL', type: 'topic' },
              ]},
              { name: 'Biology in Human Welfare', code: 'NEET_C12_BIO_BHW', type: 'chapter', children: [
                { name: 'Human Health and Disease', code: 'NEET_C12_BIO_BHW_HEALTH', type: 'topic' },
                { name: 'Microbes in Human Welfare', code: 'NEET_C12_BIO_BHW_MICRO', type: 'topic' },
                { name: 'Biotechnology', code: 'NEET_C12_BIO_BHW_BIOTECH', type: 'topic' },
              ]},
              { name: 'Ecology and Environment', code: 'NEET_C12_BIO_ECO', type: 'chapter', children: [
                { name: 'Organisms and Populations', code: 'NEET_C12_BIO_ECO_OP', type: 'topic' },
                { name: 'Ecosystem', code: 'NEET_C12_BIO_ECO_ECO', type: 'topic' },
                { name: 'Biodiversity and Conservation', code: 'NEET_C12_BIO_ECO_BIODIV', type: 'topic' },
                { name: 'Environmental Issues', code: 'NEET_C12_BIO_ECO_ENV', type: 'topic' },
              ]},
            ],
          },
        ],
      },
    ],
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
              { name: 'Physical World and Measurement', code: 'CBSE_C11_PHY_PWM', type: 'chapter', children: [
                { name: 'SI Units and Dimensions', code: 'CBSE_C11_PHY_PWM_SI', type: 'topic' },
                { name: 'Significant Figures', code: 'CBSE_C11_PHY_PWM_SIG', type: 'topic' },
                { name: 'Error Analysis', code: 'CBSE_C11_PHY_PWM_ERR', type: 'topic' },
              ]},
              { name: 'Kinematics', code: 'CBSE_C11_PHY_KIN', type: 'chapter', children: [
                { name: 'Motion in 1D', code: 'CBSE_C11_PHY_KIN_1D', type: 'topic' },
                { name: 'Motion in 2D', code: 'CBSE_C11_PHY_KIN_2D', type: 'topic' },
                { name: 'Projectile Motion', code: 'CBSE_C11_PHY_KIN_PROJ', type: 'topic' },
              ]},
              { name: 'Laws of Motion', code: 'CBSE_C11_PHY_LOM', type: 'chapter', children: [
                { name: "Newton's Laws", code: 'CBSE_C11_PHY_LOM_NL', type: 'topic' },
                { name: 'Friction', code: 'CBSE_C11_PHY_LOM_FRIC', type: 'topic' },
                { name: 'Circular Motion', code: 'CBSE_C11_PHY_LOM_CM', type: 'topic' },
              ]},
              { name: 'Work, Energy and Power', code: 'CBSE_C11_PHY_WEP', type: 'chapter', children: [
                { name: 'Work and Energy', code: 'CBSE_C11_PHY_WEP_WE', type: 'topic' },
                { name: 'Conservation of Energy', code: 'CBSE_C11_PHY_WEP_COE', type: 'topic' },
                { name: 'Power', code: 'CBSE_C11_PHY_WEP_POWER', type: 'topic' },
              ]},
              { name: 'Rotational Motion', code: 'CBSE_C11_PHY_ROT', type: 'chapter', children: [
                { name: 'Center of Mass', code: 'CBSE_C11_PHY_ROT_COM', type: 'topic' },
                { name: 'Moment of Inertia', code: 'CBSE_C11_PHY_ROT_MOI', type: 'topic' },
                { name: 'Torque and Angular Momentum', code: 'CBSE_C11_PHY_ROT_TAM', type: 'topic' },
              ]},
              { name: 'Gravitation', code: 'CBSE_C11_PHY_GRV', type: 'chapter', children: [
                { name: 'Universal Gravitation', code: 'CBSE_C11_PHY_GRV_UG', type: 'topic' },
                { name: 'Kepler Laws', code: 'CBSE_C11_PHY_GRV_KEP', type: 'topic' },
                { name: 'Satellites', code: 'CBSE_C11_PHY_GRV_SAT', type: 'topic' },
              ]},
              { name: 'Mechanics of Solids and Fluids', code: 'CBSE_C11_PHY_MSF', type: 'chapter', children: [
                { name: 'Elasticity', code: 'CBSE_C11_PHY_MSF_ELAS', type: 'topic' },
                { name: 'Fluid Mechanics', code: 'CBSE_C11_PHY_MSF_FLUID', type: 'topic' },
                { name: 'Surface Tension and Viscosity', code: 'CBSE_C11_PHY_MSF_STV', type: 'topic' },
              ]},
              { name: 'Heat and Thermodynamics', code: 'CBSE_C11_PHY_HT', type: 'chapter', children: [
                { name: 'Thermal Properties', code: 'CBSE_C11_PHY_HT_TP', type: 'topic' },
                { name: 'Laws of Thermodynamics', code: 'CBSE_C11_PHY_HT_LOT', type: 'topic' },
                { name: 'Kinetic Theory', code: 'CBSE_C11_PHY_HT_KT', type: 'topic' },
              ]},
              { name: 'Oscillations and Waves', code: 'CBSE_C11_PHY_OSW', type: 'chapter', children: [
                { name: 'SHM', code: 'CBSE_C11_PHY_OSW_SHM', type: 'topic' },
                { name: 'Wave Motion', code: 'CBSE_C11_PHY_OSW_WAV', type: 'topic' },
                { name: 'Sound', code: 'CBSE_C11_PHY_OSW_SOUND', type: 'topic' },
              ]},
            ],
          },
        ],
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
              { name: 'Electrostatics', code: 'CBSE_C12_PHY_ELS', type: 'chapter', children: [
                { name: 'Electric Field', code: 'CBSE_C12_PHY_ELS_EF', type: 'topic' },
                { name: 'Gauss Law', code: 'CBSE_C12_PHY_ELS_GL', type: 'topic' },
                { name: 'Electric Potential', code: 'CBSE_C12_PHY_ELS_EP', type: 'topic' },
                { name: 'Capacitors', code: 'CBSE_C12_PHY_ELS_CAP', type: 'topic' },
              ]},
              { name: 'Current Electricity', code: 'CBSE_C12_PHY_CE', type: 'chapter', children: [
                { name: 'Ohm Law', code: 'CBSE_C12_PHY_CE_OHM', type: 'topic' },
                { name: 'Kirchhoff Laws', code: 'CBSE_C12_PHY_CE_KIRCH', type: 'topic' },
                { name: 'Potentiometer', code: 'CBSE_C12_PHY_CE_POT', type: 'topic' },
              ]},
              { name: 'Magnetism and EMI', code: 'CBSE_C12_PHY_MEMI', type: 'chapter', children: [
                { name: 'Magnetism', code: 'CBSE_C12_PHY_MEMI_MAG', type: 'topic' },
                { name: 'Electromagnetic Induction', code: 'CBSE_C12_PHY_MEMI_EMI', type: 'topic' },
                { name: 'AC', code: 'CBSE_C12_PHY_MEMI_AC', type: 'topic' },
              ]},
              { name: 'Optics', code: 'CBSE_C12_PHY_OPT', type: 'chapter', children: [
                { name: 'Ray Optics', code: 'CBSE_C12_PHY_OPT_RAY', type: 'topic' },
                { name: 'Wave Optics', code: 'CBSE_C12_PHY_OPT_WAVE', type: 'topic' },
              ]},
              { name: 'Modern Physics', code: 'CBSE_C12_PHY_MOD', type: 'chapter', children: [
                { name: 'Dual Nature', code: 'CBSE_C12_PHY_MOD_DUAL', type: 'topic' },
                { name: 'Atoms and Nuclei', code: 'CBSE_C12_PHY_MOD_ATOM', type: 'topic' },
                { name: 'Semiconductor Electronics', code: 'CBSE_C12_PHY_MOD_SEMI', type: 'topic' },
              ]},
            ],
          },
        ],
      },
    ],
  },
];

export async function seedSyllabus() {
  console.log('[seeder] Clearing existing syllabus nodes...');
  await SyllabusNode.deleteMany({});
  
  async function seedBranch(children, parentId = null, parentPath = ',', level = 0) {
    if (!children || children.length === 0) return;
    
    for (const item of children) {
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

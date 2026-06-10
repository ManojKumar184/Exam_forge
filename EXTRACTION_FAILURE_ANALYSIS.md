# Extraction Failure Analysis

Generated: 2026-06-09T13:09:46.421Z

## Failure Clusters

| Rank | Failure Mode | Frequency | Severity | Affected Files | Root Cause | Code Location |
| ---: | --- | ---: | --- | --- | --- | --- |
| 1 | equation_corruption | 24 | high | jee_mains.pdf, Physics.docx, Physics_cleaned_dataset.docx | Source math signatures were not preserved in extracted stem/formula fields. | backend/src/extraction/mathConverter.js; backend/src/extraction/docxMathHtml.js |
| 2 | lost_option | 22 | high | test_image1.png, jee_mains.pdf, Physics.docx, Physics_cleaned_dataset.docx | Detected option count is lower than source option count. | backend/src/extraction/optionParser.js; backend/src/extraction/mcqOptionExtract.js |
| 3 | mcq_single_classified_as_descriptive | 19 | medium | Physics.docx, Physics_cleaned_dataset.docx | Question type classifier disagreed with source structural cues. | backend/src/extraction/detectQuestionType.js; backend/src/extraction/documentIntelligence/questionTypeClassifier.js |
| 4 | option_split | 14 | high | jee_mains.pdf, Physics.docx, Physics_cleaned_dataset.docx | Detected option count is higher than source option count. | backend/src/extraction/optionParser.js; backend/src/extraction/mcqOptionExtract.js |
| 5 | missing_question | 12 | critical | jee_mains.pdf, Physics.docx, Physics_cleaned_dataset.docx | Source question had no aligned extracted object above semantic threshold. | backend/src/extraction/normalizeQuestions.js; backend/src/extraction/documentIntelligence/boundaryDetector.js |
| 6 | image_detachment | 12 | high | jee_mains.pdf, Physics.docx, Physics_cleaned_dataset.docx | Source references a figure/diagram but extracted object has no image association. | backend/src/extraction/htmlQuestionParser.js; backend/src/extraction/extractDocxQuestions.js |
| 7 | numerical_classified_as_descriptive | 6 | medium | Physics.docx, Physics_cleaned_dataset.docx | Question type classifier disagreed with source structural cues. | backend/src/extraction/detectQuestionType.js; backend/src/extraction/documentIntelligence/questionTypeClassifier.js |
| 8 | stem_mismatch | 5 | medium | test_image1.png, Physics.docx, Physics_cleaned_dataset.docx | Semantic comparison below threshold. | backend/src/extraction |
| 9 | wrong_question_boundary | 2 | critical | test_image1.png, Physics_cleaned_dataset.docx | Question start/end reconstruction merged or split adjacent semantic content. | backend/src/extraction/normalizeQuestions.js; backend/src/extraction/documentIntelligence/boundaryDetector.js |
| 10 | extra_question | 2 | medium | jee_mains.pdf, Physics.docx | Semantic comparison below threshold. | backend/src/extraction |
| 11 | table_flattening | 2 | high | Physics.docx, Physics_cleaned_dataset.docx | Source references a table but extracted object lacks table metadata. | backend/src/extraction/docxAdvancedParser.js; backend/src/extraction/docxMathHtml.js |
| 12 | option_ordering_error | 1 | high | test_image1.png | Option labels/order changed during extraction. | backend/src/extraction/optionParser.js; backend/src/extraction/mcqOptionExtract.js |
| 13 | descriptive_classified_as_numerical | 1 | medium | test_image2.png | Question type classifier disagreed with source structural cues. | backend/src/extraction/detectQuestionType.js; backend/src/extraction/documentIntelligence/questionTypeClassifier.js |
| 14 | descriptive_classified_as_mcq_multi | 1 | medium | Physics.docx | Question type classifier disagreed with source structural cues. | backend/src/extraction/detectQuestionType.js; backend/src/extraction/documentIntelligence/questionTypeClassifier.js |
| 15 | descriptive_classified_as_match_columns | 1 | medium | Physics.docx | Question type classifier disagreed with source structural cues. | backend/src/extraction/detectQuestionType.js; backend/src/extraction/documentIntelligence/questionTypeClassifier.js |
| 16 | match_columns_classified_as_descriptive | 1 | medium | Physics.docx | Question type classifier disagreed with source structural cues. | backend/src/extraction/detectQuestionType.js; backend/src/extraction/documentIntelligence/questionTypeClassifier.js |
| 17 | option_merge | 1 | high | Physics_cleaned_dataset.docx | Option content differs semantically despite matching count. | backend/src/extraction/optionParser.js; backend/src/extraction/mcqOptionExtract.js |
| 18 | numerical_classified_as_mcq_multi | 1 | medium | Physics_cleaned_dataset.docx | Question type classifier disagreed with source structural cues. | backend/src/extraction/detectQuestionType.js; backend/src/extraction/documentIntelligence/questionTypeClassifier.js |

## Top 20 Failure Modes Blocking 99% Question and Option Detection

| Rank | Failure Mode | Current Impact | Option Impact | Examples |
| ---: | --- | ---: | ---: | --- |
| 1 | equation_corruption | -0 questions | -0 option cases | jee_mains.pdf::source::1, Physics.docx::source::28, Physics.docx::source::29, Physics.docx::source::31, Physics_cleaned_dataset.docx::source::3 |
| 2 | lost_option | -0 questions | -22 option cases | test_image1.png::source::1, jee_mains.pdf::source::1, Physics.docx::source::8, Physics_cleaned_dataset.docx::source::4, Physics_cleaned_dataset.docx::source::7 |
| 3 | mcq_single_classified_as_descriptive | -0 questions | -0 option cases | Physics.docx::source::8, Physics_cleaned_dataset.docx::source::4, Physics_cleaned_dataset.docx::source::5, Physics_cleaned_dataset.docx::source::6 |
| 4 | option_split | -0 questions | -14 option cases | jee_mains.pdf::extracted::1, Physics.docx::source::4, Physics.docx::source::5, Physics.docx::source::11, Physics_cleaned_dataset.docx::source::3 |
| 5 | missing_question | -12 questions | -0 option cases | jee_mains.pdf::source::1, Physics.docx::source::39, Physics.docx::source::40, Physics.docx::source::41, Physics_cleaned_dataset.docx::source::32 |
| 6 | image_detachment | -0 questions | -0 option cases | jee_mains.pdf::source::1, Physics.docx::source::2, Physics.docx::source::3, Physics.docx::source::13, Physics_cleaned_dataset.docx::source::3 |
| 7 | numerical_classified_as_descriptive | -0 questions | -0 option cases | Physics.docx::source::24, Physics.docx::source::25, Physics.docx::source::27, Physics_cleaned_dataset.docx::source::25 |
| 8 | stem_mismatch | -0 questions | -0 option cases | test_image1.png::source::1, Physics.docx::source::16, Physics.docx::source::37, Physics_cleaned_dataset.docx::source::3, Physics_cleaned_dataset.docx::source::31 |
| 9 | wrong_question_boundary | -2 questions | -0 option cases | test_image1.png::source::1, Physics_cleaned_dataset.docx::source::31 |
| 10 | extra_question | -0 questions | -0 option cases | jee_mains.pdf::extracted::1, Physics.docx::extracted::1 |
| 11 | table_flattening | -0 questions | -0 option cases | Physics.docx::source::15, Physics_cleaned_dataset.docx::source::16 |
| 12 | option_ordering_error | -0 questions | -1 option cases | test_image1.png::source::1 |
| 13 | descriptive_classified_as_numerical | -0 questions | -0 option cases | test_image2.png::source::1 |
| 14 | descriptive_classified_as_mcq_multi | -0 questions | -0 option cases | Physics.docx::source::36 |
| 15 | descriptive_classified_as_match_columns | -0 questions | -0 option cases | Physics.docx::source::37 |
| 16 | match_columns_classified_as_descriptive | -0 questions | -0 option cases | Physics.docx::source::38 |
| 17 | option_merge | -0 questions | -1 option cases | Physics_cleaned_dataset.docx::source::23 |
| 18 | numerical_classified_as_mcq_multi | -0 questions | -0 option cases | Physics_cleaned_dataset.docx::source::31 |

## Detailed Diffs

### test_image1.png

#### test_image1.png::source::1

Failures: wrong_question_boundary, stem_mismatch, lost_option, option_ordering_error

Source: Question: In equilateral prism the path of a ray is shown. Determine Options: (a) 1.71 (©139 (@) 184 Answer: (¢) Question: What is the equivalent gate for the circuit? =D Options: (a) AND gate (b) OR gate (c) NAND gate (d) NOR gate Answer: (d)

Extracted: Options: (a) 1.71 (©139 (@) 184 Answer: (¢) =D Options: A. AND gate B. OR gate C. NAND gate D. NOR gate

Stem similarity: 28.68%

### test_image2.png

#### test_image2.png::source::1

Failures: descriptive_classified_as_numerical

Source: Question: Position of a particle is given by x = asin(50t + 7/3). If speed and acceleration is zero,, for the first time at time t, & t; respectively. Then t, & t, are Options: ™ kL @ 150° 300 m™ ™ ®) 300° 75 Tom © 50° 150 ™ ™ (@ 300° 150 Answers (b) Question: In Bohr's atomic model. Find ratio of magnetic field produced at center by 2* orbit and 4" orbit. A...

Extracted: Options: ™ kL @ 150° 300 m™ ™ ®) 300° 75 Tom © 50° 150 ™ ™ (@ 300° 150 Answers (b) 2* orbit and 4" orbit. Answer: (¢) Question: Position of a particle is given by x = asin(50t + 7/3). If speed and acceleration is zero,, for the first time at time t, & t; respectively. Then t, & t, are Question: In Bohr's atomic model. Find ratio of magnetic field produced at...

Stem similarity: 89.62%

### jee_mains.pdf

#### jee_mains.pdf::source::1

Failures: missing_question, lost_option, equation_corruption, image_detachment

Source: JEE-Main-02-04-2026 (Memory Based) [EVENING SHIFT] Physics Question: In equilateral prism the path of a ray is shown. Determine 𝝁 Options: (a) 1.71 (b) 1.52 (c) 1.39 (d) 1.84 Answer: (c) Question: What is the equivalent gate for the circuit? Options: (a) AND gate (b) OR gate (c) NAND gate (d) NOR gate Answer: (d) Question: A soap bubble of radius r = 1 mm, ...

Extracted: 

Stem similarity: 0.00%

#### jee_mains.pdf::extracted::1

Failures: extra_question, option_split

Source: 

Extracted: JEE-Main-02-04-2026 (Memory Based) [EVENING SHIFT] Question: In equilateral prism the path of a ray is shown. Determine 𝝁 Options: Question: Arrange following complexes in increasing order of CFSE (∆0) (a) [Co(H2O)6]2+ (b) [Co(H2O)6]3+ (c) [Co(en)3]3+ Options: NaOH solution. pH of solution at 25°C is, (pKa of weak acid is 4.76) Options: A. 1.71 B. 1.52 C. 1...

Stem similarity: 0.00%

### Physics.docx

#### Physics.docx::source::2

Failures: image_detachment

Source: 1. Electric charge is transferred to an irregular metallic disk as shown in figure. If and are charge densities at given points then, choose the correct answer from the options given below:(A) (B) (C) (D) (E) [April 8, 2025 (II)](A) A, B and C Only (B) A and C only(C) D and E only (D) B and C only

Extracted: 1. Electric charge is transferred to an irregular metallic disk as shown in figure. If and are charge densities at given points then, choose the correct answer from the options given below:(A) (B) (C) (D) (E) [April 8, 2025 (II)](A) A, B and C Only(B) A and C only(C) D and E only(D) B and C only

Stem similarity: 94.84%

#### Physics.docx::source::3

Failures: image_detachment

Source: 2. A small bob of mass 100 mg and charge is connected to an insulating string of length 1 m . It is brought near to an infinitely long non-conducting sheet of charge density ' ' as shown in figure. If string subtends an angle of with the sheet at equilibrium the charge density of sheet will be :(Given add acceleration due to gravity, ) [April 2, 2025 (I)](A)...

Extracted: 2. A small bob of mass 100 mg and charge is connected to an insulatingstring of length 1 m . It is brought near to an infinitely long non-conducting sheet of charge density ' ' as shown in figure. If string subtends an angle of with the sheet at equilibrium the charge density of sheet will be :(Given add acceleration due to gravity, )[April 2, 2025 (I)](A) (...

Stem similarity: 96.60%

#### Physics.docx::source::4

Failures: option_split

Source: 3. A small uncharged conducting sphere is placed in contact with an identical sphere but having charge and then removed to a distance such that the force of repulsion between them is . The distance between them is(Take as in Sl units) [Jan. 24, 2025 (II)](A) 2 cm (B) 3 cm(C) 4 cm (D) 1 cm

Extracted: 3. A small uncharged conducting sphere is placed in contact with an identical sphere but having charge and then removed to a distance such that the force of repulsion between them is . The distance between them is(Take as in Slunits)[Jan. 24, 2025 (II)] A. 2 cm B. 3 cm C. 4 cm D. 1 cm

Stem similarity: 84.88%

#### Physics.docx::source::5

Failures: option_split

Source: 4. Two identical conducting spheres and with charge on each, repel each other with a force I N . A third identical uncharged conducting sphere R is successively brought in contact with the two spheres. The new force of repulsion between P and S is : [April 6, 2024 (II)](A) 4 N (B) 6 N(C) 1 N (D) 12 N

Extracted: 4. Two identical conducting spheres and with charge on each, repel each other with a force I N . A third identical uncharged conducting sphere R is successively brought in contact with the two spheres. The new force of repulsion between P and S is :[April 6, 2024 (II)] A. 4 N B. 6 N C. 1 N D. 12 N

Stem similarity: 90.44%

#### Physics.docx::source::8

Failures: lost_option, mcq_single_classified_as_descriptive

Source: 7. If two charges and are separated with distance " " and placed in a medium of dielectric constant . What will be the equivalent distance between charges in air for the same electrostatic force? [Jan. 24, 2023 (I)] (A) (B) (C) (D)

Extracted: 7. If two charges and are separated with distance " " and placed in a medium of dielectric constant . What will be the equivalent distance between charges in air for the same electrostatic force?[Jan. 24, 2023 (I)] A.  B.  C.

Stem similarity: 98.69%

#### Physics.docx::source::11

Failures: option_split

Source: 10. A charge of is to be divided into two parts. The distance between the two divided charges is constant. The magnitude of the divided charges so that the force between them is maximum, will be: [July 27, 2022 (II)](A) and (B) and (C) 0 and (D) and

Extracted: 10. A charge of is to be divided into two parts. The distance between the two divided charges is constant. The magnitude of the divided charges so that the force between them is maximum, will be:[July 27, 2022 (II)] A. and B. and C. 0 and D. and

Stem similarity: 86.82%

#### Physics.docx::source::13

Failures: image_detachment

Source: 12. Three identical charged balls each of charge 2 C are suspended from a common point P by silk threads of 2 m each (as shown in figure). They form an equilateral triangle of side 1 m . The ratio of net force on a charged ball to the force between any two charged balls will be: [June 27, 2022 (II)](A) (B) (C) (D)

Extracted: 12. Three identical charged balls each of charge 2 C are suspended from a common point P by silk threads of 2 m each (as shown in figure). They form an equilateral triangle of side 1 m . The ratio of net force on a charged ball to the force between any two charged balls will be: [June 27, 2022 (II)](A) (B) (C) (D)

Stem similarity: 99.09%

#### Physics.docx::source::15

Failures: option_split, table_flattening

Source: 14. Two identical charged particles each having a mass 10 g and charge placed on a horizontal table with a separation of between then such that they stay in limited equilibrium. If the coefficient of friction between each particle and the table is 0.25 , find the value of . [June 24, 2022 (II)][Use ](A) 12 cm (B) 10 cm(C) 8 cm (D) 5 cm

Extracted: 14. Two identical charged particles each having a mass10 g and charge placed on a horizontal table with a separation of between thensuch that they stay in limited equilibrium. If the coefficient of friction between each particle and the table is 0.25 , find the value of .[June 24, 2022 (II)][Use ] A. 12 cm B. 10 cm C. 8 cm D. 5 cm

Stem similarity: 84.63%

#### Physics.docx::source::16

Failures: stem_mismatch, option_split

Source: 15. Two particles and having charges and respectively are held fixed with a separation of 5 cm . At what position a third charged particle should be placed so that it does not experience a net electric force? [Aug. 31, 2021 (I)](A) At 5 cm from on the left side of system(B) At 5 cm from on the right side(C) At 1.25 cm from between two charges(D) At midpoint ...

Extracted: 15. Two particles and having charges and respectively are held fixed with a separation of 5 cm . At what position a third charged particle should be placed so that it does not experience a net electric force?[Aug. 31, 2021 (I)] A. At 5 cm from on the left side of system B. At 5 cm from on the right side C. At 1.25 cm from between two charges D. At midpoint b...

Stem similarity: 65.30%

#### Physics.docx::source::22

Failures: image_detachment

Source: 21. Shown in the figure are two point charges +Q and -Q inside the cavity of a spherical shell. The charges are kept near the surface of the cavity on opposite sides of the centre of the shell.If is the surface charge on the inner surface and net charge on it and the surface charge on the outer surface and net charge on it then: [Online April 10, 2015](A) (B...

Extracted: 21. Shown in the figure are two point charges +Q and -Q inside the cavity of a spherical shell. The charges are kept near the surface of the cavity on opposite sides of the centreof the shell.If is the surface charge on the inner surface and net charge on it and the surface charge on the outer surface and net charge on it then:[Online April 10, 2015](A) (B) ...

Stem similarity: 97.78%

#### Physics.docx::source::24

Failures: numerical_classified_as_descriptive

Source: 22. A positive ion A and a negative ion B has charges and , and masses and respectively At an instant, the ions are separated by a certain distance r . At that instant the ratio of the magnitudes of electrostatic force to gravitational force is , where the value of P is _____.(Take 'and universal gravitational constant as ) [Jan, 23, 2025 (I)]

Extracted: 22. A positive ion A and a negative ion B hascharges and , and masses and respectively Atan instant, the ions are separated by a certain distance r . At that instant the ratio of the magnitudes of electrostatic force to gravitational force is , where the value of P is _____.(Take 'and universal gravitational constant as )[Jan,23, 2025 (I)]

Stem similarity: 93.73%

#### Physics.docx::source::25

Failures: numerical_classified_as_descriptive

Source: 23. Two identical charged spheres are suspended by strings of equal tengths. The strings makean angle 0 with each other When suspended in water the angle remains the same. If density of the material of the sphere is , the dielectric constant of water will be _____. (Take density of water == I g/cc) [Feb 1, 2024 (I)]

Extracted: 23. Two identical charged spheres are suspended by strings of equal tengths. The strings makeanangle 0 with each other When suspended in water the angle remains the same. If density of the material of the sphere is , the dielectric constant of water will be _____.(Take density of water == I g/cc)[Feb1, 2024 (I)]

Stem similarity: 94.52%

#### Physics.docx::source::27

Failures: numerical_classified_as_descriptive

Source: 25. Two identical charged spheres are suspended by strings of equal lengths. The strings make an angle of with each other. When suspended in a liquid of density , the angle remains same. If density of material of the sphere is , the diefectric constant of the liquid is _____. [Jan. 30, 2024 (II)]

Extracted: 25. Two identical charged spheres are suspended by strings of equal lengths. The strings make an angle of with each other. When suspended in a liquid of density , the angle remains same. If density of material of the sphere is , the diefectricconstant of the liquid is _____.[Jan. 30, 2024 (II)]

Stem similarity: 96.88%

#### Physics.docx::source::28

Failures: equation_corruption

Source: 26. A thin metallic wire having cross sectional arca of in is used to make a ring of radius 30 cm . A positive charge of 2 z C is uniformly distributed over the ring, while another pesitive charge of 30 pC is kept at the centre of the ring The tension in thering is _____ N ; provided that the ming does not get deformed (neglect the influence of gravity). (gi...

Extracted: 26. A thin metallic wire having cross sectional arca of in is used to make a ring of radius 30 cm . A positive charge of 2 z C is uniformly distributed over the ring, while another pesitivecharge of 30 pCis kept at the centreof the ring The tension in theringis _____N ; provided that the ming does not get deformed (neglect the influence of gravity). (given, ...

Stem similarity: 89.13%

#### Physics.docx::source::29

Failures: numerical_classified_as_descriptive, equation_corruption

Source: 27. Three point charges and are placed on -axis at a distance and respectively from origin as shown. If and , the magnitude of net force experienced by the charge is _____ N. [April 13, 2023 (II)]

Extracted: 27. Three point charges and are placed on -axis at a distance and respectively from origin as shown. If and , the magnitude of net force experienced by the charge is _____N.[April 13, 2023(II)]

Stem similarity: 93.16%

#### Physics.docx::source::30

Failures: image_detachment

Source: 28. As shown in the figure, a configuration of two equal point charges is placed on an inclined plane. Mass of each point charge is 20 g . Assume that there is no friction between charge and plane for the system of two point charges to be in equilibrium (at rest) the height h =. The value of is _____. [April 11 2023 (II)](Take )

Extracted: 28. As shown in the figure, a configuration of two equal point charges is placed on an inclined plane. Mass of each point charge is 20 g . Assume that there is no frictionbetween charge and plane for the system of two pointcharges to be in equilibrium (at rest) the heighth=. The value of is _____. [April 112023(II)](Take )

Stem similarity: 90.84%

#### Physics.docx::source::31

Failures: equation_corruption

Source: 29. Two equal positive point charges are separated by a distance 2a. The distance of a point from the centre of the line joining two charges on the equatorial line (perpendicular bisector) at which force experienced by a test charge becomes maximum is . The value of x is _____. [Feb. 1, 2023 (I)]

Extracted: 29. Two equal positive point charges are separated by a distance 2a. The distance of a point from the centreof the line joining two charges on the equatorial line (perpendicular bisector) at which force experienced by a test charge becomes maximum is . The value of x is_____.[Feb. 1, 2023 (I)]

Stem similarity: 94.53%

#### Physics.docx::source::32

Failures: numerical_classified_as_descriptive

Source: 30. A point charge is placed at origin. Another point charge is placed at . Charge of proton is . The proton is placed on x -axis so that the electrostatic force on the proton is zero. In this situation, the position of the proton from the origin is _____cm . [Jan. 29, 2023 (I)]

Extracted: 30. A point charge is placed at origin. Another point charge is placed at . Charge of proton is . The proton is placed on x -axis so that the electrostatic force on the proton is zero. In this situation, the position of the proton from the origin is _____cm .[Jan. 29, 2023 (I)]

Stem similarity: 98.96%

#### Physics.docx::source::34

Failures: equation_corruption

Source: 32. Two identical conducting spheres with negligible volume have 2.1 nC and -0.1 nC charges, respectively. They are brought into contact and then separated by a distance of 0.5 m . The electrostatic force acting between the spheres is _____ .[Given : SI unit] [Feb. 25, 2021 (II)]

Extracted: 32. Two identical conducting spheres with negligible volume have 2.1 nCand -0.1 nCcharges, respectively. They are brought into contact and then separated by a distance of 0.5m . The electrostatic force acting between the spheres is_____.[Given : SI unit][Feb. 25, 2021 (II)] Part B (JEE Advanced)

Stem similarity: 83.69%

#### Physics.docx::source::36

Failures: descriptive_classified_as_mcq_multi

Source: 1. Two beads, each with charge and mass , are on a horizontal, frictionless, non-conducting, circular hoop of radius R . One of the beads is glued to the hoop at some point, while the other one performs small oscillations about its equilibrium position along the hoop. The square of the angular frequency of the small oscillations is given by [ is the permitti...

Extracted: 1. Two beads, each with charge and mass , are on a horizontal, frictionless, non-conducting, circular hoop of radius R . One of the beads is glued to the hoop at some point, while the other one performs small oscillations about its equilibrium position along the hoop. The square of the angular frequency of the small oscillations is given by [ is the permitti...

Stem similarity: 90.75%

#### Physics.docx::source::37

Failures: stem_mismatch, option_split, descriptive_classified_as_match_columns

Source: 2. Two identical non-conducting solid spheres of same mass and charge are suspended in air from a common point by two nonconducting, massless strings of same length. At equilibrium, the angle between the strings is . The spheres are now immersed in a dielectric liquid of density and dielectric constant 21 . If the angle between the strings remains the same a...

Extracted: 2. Two identical non-conducting solid spheres of same mass and charge are suspended in air from a common point by two nonconducting, massless strings of same length. At equilibrium, the angle between the strings is . The spheres are now immersed in a dielectric liquid of density and dielectric constant 21 . If the angle between the strings remains the same a...

Stem similarity: 71.08%

#### Physics.docx::source::38

Failures: option_split, match_columns_classified_as_descriptive

Source: 3. Four charges and of same magnitude are fixed along the axis at and , respectively. A positive charge is placed on the positive axis at a distance . Four options of the signs of these charges are given in List-I. The direction of the forces on the charge is given in List-II. Match List-I with List-II and select the correct answer using the code given below...

Extracted: 3. Four charges and of same magnitude are fixed along the axis at and , respectively. A positive charge is placed on the positive axis at a distance . Four options of the signs of these charges are given in List-I. The direction of the forces on the charge is given in List-II. Match List-I with List-II and select the correct answer using the code given below...

Stem similarity: 94.46%

#### Physics.docx::source::39

Failures: missing_question

Source: 1. Q. positive; negative

Extracted: 

Stem similarity: 0.00%

#### Physics.docx::source::40

Failures: missing_question

Source: 2. R. positive; negative

Extracted: 

Stem similarity: 0.00%

#### Physics.docx::source::41

Failures: missing_question

Source: 3. S. positive; negative

Extracted: 

Stem similarity: 0.00%

#### Physics.docx::source::42

Failures: missing_question

Source: 4. Codes:(A) P-3, Q-1, R-4, S-2(B) P-4, Q-2, R-3, S-1(C) P-3, Q-1, R-2, S-4(D) P-4, Q-2, R-1, S-3

Extracted: 

Stem similarity: 0.00%

#### Physics.docx::extracted::1

Failures: extra_question

Source: 

Extracted: Part A (JEE Main)

Stem similarity: 0.00%

### Physics_cleaned_dataset.docx

#### Physics_cleaned_dataset.docx::source::3

Failures: stem_mismatch, option_split, equation_corruption, image_detachment

Source: 1. Electric charge is transferred to an irregular metallic disk as shown in figure. If and are charge densities at given points then, choose the correct answer from the opions given below:(A) (B) (C) (D) (E) [April 8, 2025 (II)] (A) A, B and C Only(B) A and C only(C) D and E only(D) B and C only [solution] Option A [Question_end] [Question_start]

Extracted: 1. Electric charge is transferred to an irregular metallic disk as shown in figure. If  $σ_1,σ_2,σ_3$ and  $σ_4$ are charge densities at given points then, choose the correct answer from the opionsgiven below:(A)  $σ_1&gt;σ_3;σ_2=σ_4$ (B)  $σ_1&gt;σ_2,σ_3&gt;σ_4$ (C)  $σ_1&gt;σ_3&gt;σ_2=σ_4$ (D)  $σ_1&lt;σ_3&lt;σ_2=σ_4$ (E)  $σ_1=σ_2=σ_3=σ_4$ A. A and C only...

Stem similarity: 64.04%

#### Physics_cleaned_dataset.docx::source::4

Failures: lost_option, mcq_single_classified_as_descriptive, equation_corruption, image_detachment

Source: 2. A small bob of mass 100 mg and charge is connected to an insulating string of length 1 m . It is brought near to an infinitely long non-conducting sheet of charge density ' ' as shown in figure. If string subtends an angle of with the sheet at equilibrium the charge density of sheet will be :(Given add acceleration due to gravity, ) [April 2, 2025 (I)] (A...

Extracted: 2. A small bob of mass 100 mg and charge  $+10μC$ is connected to an insulatingstring of length 1 m . It is brought near to an infinitely long non-conducting sheet of charge density '  $σ$ ' as shown in figure. If string subtends an angle of  $45^{∘}$ with the sheet at equilibrium the charge density of sheet will be :(Given  $ε_0=8.85×10^{-12}\frac{F}{m}$ ad...

Stem similarity: 85.69%

#### Physics_cleaned_dataset.docx::source::5

Failures: option_split, mcq_single_classified_as_descriptive

Source: 3. A small uncharged conducting sphere is placed in contact with an identical sphere but having charge and then removed to a distance such that the force of repulsion between them is . The distance between them is(Take as in Sl units) [Jan 24, 2025 (II)] (A) 2 cm (B) 3 cm(C) 4 cm (D) 1 cm [solution] Option A [Question_end] [Question_start]

Extracted: 3. A small uncharged conducting sphere is placed in contact with an identical sphere but having  $4×10^{-8}C$ charge and then removed to a distance such that the force of repulsion between them is  $9×10^{-3}N$ . The distance between them is(Take  $\frac{1}{4πε_0}$ as  $9×10^{9}$ in Sl units) [Jan24, 2025 (II)] [solution] Option A [Question_end] [Question_st...

Stem similarity: 85.95%

#### Physics_cleaned_dataset.docx::source::6

Failures: option_split, mcq_single_classified_as_descriptive

Source: 4. Two identical conducting spheres and with charge on each, repel each other with a force 16 N . A third identical uncharged conducting sphere is successively brought in contact with the two spheres. The new force of repulsion between P and S is : [April 6, 2024 (II)] (A) 4 N (B) 6 N(C) 1 N (D) 12 N [solution] Option A [Question_end] [Question_start]

Extracted: 4. Two identical conducting spheres  $P$ and  $S$ with charge  $Q$ on each, repel each other with a force 16 N . A third identical uncharged conducting sphere  $R$ is successively brought in contact with the two spheres. The new force of repulsion between P and S is : [April 6, 2024 (II)] [solution] Option A [Question_end] [Question_start] 4 N A. 6 N B. 1 N ...

Stem similarity: 97.19%

#### Physics_cleaned_dataset.docx::source::7

Failures: lost_option, mcq_single_classified_as_descriptive

Source: 5. Force between two point charges and placed in vacuum at ' ' cm apart is . Force between them when placed in a medium having dielectric at ' ' cm apart will be: [Jan. 31, 2024 (II)] (A) (B) 5 F(C) (D) 25 F [solution] Option A [Question_end] [Question_start]

Extracted: 5. Force between two point charges  $q_1$ and  $q_2$ placed in vacuum at '  $r$ ' cm apart is  $F$ . Force between them when placed in a medium having dielectric  $K=5$ at '  $r/5^{'}$ ' cm apart will be: [Jan. 31, 2024 (II)] [solution] Option A [Question_end] [Question_start] $F/25$ (B) 5 F(C)  $F/5$ (D) 25 F

Stem similarity: 83.73%

#### Physics_cleaned_dataset.docx::source::8

Failures: lost_option, mcq_single_classified_as_descriptive, equation_corruption

Source: 6. A charge is divided into two parts and placed at 1 cm distance so that the repulsive force between them is maximum. The charges of the two parts are : [April 13, 2023 (II)] (A) (B) (C) (D) [solution] Option A [Question_end] [Question_start]

Extracted: 6. A  $10μC$ charge is divided into two parts and placed at 1 cm distance so that the repulsive force between them is maximum. The charges of the two parts are : A. $5μC,5μC$ B. $7μC,3μC$ C. $8μC,2μC$

Stem similarity: 79.44%

#### Physics_cleaned_dataset.docx::source::9

Failures: lost_option, mcq_single_classified_as_descriptive, equation_corruption

Source: 7. If two charges and are separated with distance ' ' and placed in a medium of dielectric constant . What will be the equivalent distance between charges in air for the same electrostatic force? [Jan. 24, 2023 (1)] (A) (B) (C) (D) [solution] Option A [Question_end] [Question_start]

Extracted: 7. If two charges  $q_1$ and  $q_2$ are separated with distance '  $d$ ' and placed in a medium of dielectric constant  $K$ . What will be the equivalent distance between charges in air for the sameelectrostatic force? A. $K\sqrt[]{d}$ B. $1.5d\sqrt[]{K}$ C. $2d\sqrt[]{K}$

Stem similarity: 77.65%

#### Physics_cleaned_dataset.docx::source::10

Failures: lost_option, mcq_single_classified_as_descriptive, equation_corruption

Source: 8. Two identical metallic spheres A and B when placed at certain distance in air repel each other with a force of F . Another identical uncharged sphere is first placed in contact with A and then in contact with B and finally placed at midpoint between spheres A and B . The force experienced by sphere C will be : [July 29, 2022 (II)] (A) (B) (C) F (D) 2 F [s...

Extracted: 8. Two identical metallic spheres A and B when placed at certain distance in air repel eachother with a force of F . Another identical uncharged sphere  $C$ is first placed in contact with A and then in contact with B and finally placed at midpoint between spheres A and B . The force experienced by sphere C will be : A. $3F/4$ B. F(D) 2 F

Stem similarity: 86.11%

#### Physics_cleaned_dataset.docx::source::11

Failures: lost_option, mcq_single_classified_as_descriptive, equation_corruption

Source: 9. Two identical positive charges each are fixed at a distance of ' ' apart from each other. Another point charge with mass ' ' is placed at midpoint between two fixed charges. For a small displacement along the line joining the fixed charges, the charge executes SHM. The time period of oscillation of charge will be : [July 27, 2022 (I)] (A) (B) (C) (D) [sol...

Extracted: 9. Two identical positive charges  $Q$ each are fixed at a distance of '  $2a$ ' apart from each other. Another point charge  $q_0$ with mass '  $m$ ' is placed at midpoint between two fixed charges. For a small displacement along the line joining the fixed charges, the charge  $q_0$ executes SHM. The time periodof oscillation of charge  $q_0$ will be : A. $...

Stem similarity: 84.21%

#### Physics_cleaned_dataset.docx::source::12

Failures: lost_option, mcq_single_classified_as_descriptive, equation_corruption

Source: 10. A darge of is to be divided intotwo parts. The distance between the fwodivided charges is constant. The magnifude of the divided charges so that the force between them is maximum, will be: [July 27, 2022 (II)] (A) and (B) and (C) 0 and (D) and [solution] Option A [Question_end] [Question_start]

Extracted: 10. A dargeof  $4μC$ is to be divided intotwo parts. The distance between the fwodivided charges is constant. The magnifude of the divided charges so that the force between them is maximum, will be: A. $2μC$ and  $2μC$ B. 0 and  $4μC$ C. $1.5μC$ and  $2.5μC$

Stem similarity: 78.98%

#### Physics_cleaned_dataset.docx::source::13

Failures: lost_option, mcq_single_classified_as_descriptive, equation_corruption

Source: 11. Two point charges each are placed at a distance apart. A third point charge is placed at a distance from mid-point on the perpendicular briector. The value of at which charge a will experience the muximum Coulomb's force is [June 29, 2022 (II)] (A) (B) (C) (D) [solution] Option A [Question_end] [Question_start]

Extracted: 11. Two point charges  $Q$ each are placed at a distance  $d$ apart. A third point charge  $q$ is placed at a distance  $x$ from mid-point on the perpendicular briector. The value of  $x$ at which charge a will experience the muximumCoulomb's force is A. $x=\frac{d}{2}$ B. $x=\frac{d}{\sqrt[]{2}}$ C. $1=\frac{d}{2\sqrt[]{2}}$

Stem similarity: 81.76%

#### Physics_cleaned_dataset.docx::source::14

Failures: lost_option, mcq_single_classified_as_descriptive, equation_corruption, image_detachment

Source: 12. Three identical charged balls each of charge 2 C are suspended from a common point by silk threads of 2 m each (as shown in figure). They form an equilateral triangle of side im. The ratio of net force on a charged ball to the force between any two charged balls will be : [June 27, 2022 (11)] (A) (B) (C) (D) [solution] Option A [Question_end] [Question_s...

Extracted: 12. Three identical charged balls each of charge 2 C are suspended from a common point  $P$ by silk threads of 2 m each (as shown in figure). They form an equilateral triangle of side im. The ratio of net force on a charged ball to the force between any two charged balls will be : A. $1:4$ B. $\sqrt[]{3}:2$ C. $\sqrt[]{3}:1$

Stem similarity: 87.76%

#### Physics_cleaned_dataset.docx::source::15

Failures: lost_option, mcq_single_classified_as_descriptive, equation_corruption

Source: 13. Sixty four conducting drops sach of radius 0.02 m and each carrying a charge of are combined to form a bigger drop. The ratio of surface density of bigger drop to the smaller drop will be: [June 26, 2022 (II)] (A) (B) (C) (D) [solution] Option A [Question_end] [Question_start]

Extracted: 13. Sixty four conductingdrops sachof radius 0.02 m and each carrying a charge of  $5μC$ are combined to form a bigger drop. The ratio of surface density of bigger drop to the smaller drop will be: A. $4:1$ B. $1:8$ C. $8:1$

Stem similarity: 76.66%

#### Physics_cleaned_dataset.docx::source::16

Failures: option_split, mcq_single_classified_as_descriptive, table_flattening

Source: 14. Two identical charged particles each having a mass 10 g and charge C placed on a horizontal table with a separation of between then such that they stay in limited equilibrium. If the coefficient of friction between each particle and the table is 0.25 , find the value of . [ Use g = ] [June 24, 2022 (II)] (A) 12 cm (B) 10 cm(C) 8 cm (D) 5 cm [solution] Op...

Extracted: 14. Two identical charged particles each having a mass10 g and charge  $2.0=10$ C placed on a horizontal table with a separation of  $L$ between then such that they stay in limited equilibrium. If the coefficient of friction between each particle and the table is 0.25 , find the value of $L$ .[Useg = $10ms^{-2}$ ] [June 24, 2022 (II)] [solution] Option A [Qu...

Stem similarity: 90.80%

#### Physics_cleaned_dataset.docx::source::17

Failures: option_split, equation_corruption

Source: 15. Two particles A and B having charges and respectively are held fixed with a separation of 5 cm . At what position a third chargod particle should be placed so that it does not experience a net electric force? [Aug. 31, 2021 (I)] (A) At 5 cm from on the left side of system(B) At 5 cm from on the right side(C) At 1.25 cm from between two charges(D) At midp...

Extracted: 15. Two particles A and B having charges  $20μC$ and  $-5μC$ respectively are held fixed with a separation of 5 cm . At what position a third chargod particle should be placed so that it does not experience a net electric force? A. At 5 cm from  $-5μC$ on the right side B. At 1.25 cm from  $-5μC$ between two charges C. At midpoint between two charges

Stem similarity: 82.36%

#### Physics_cleaned_dataset.docx::source::18

Failures: lost_option, mcq_single_classified_as_descriptive, equation_corruption

Source: 16. Two identical tennis balls each having mass ‘m’ and charge ‘q’ are suspended from a fixed point by threads of length ‘l’. What is the equilibrium separation when each thread makes a small angle '' with the vertical ? [July 27, 2021 (II)] (A) (B) (C) (D) [solution] Option A [Question_end] [Question_start]

Extracted: 16. Two identical tennis balls each having mass ‘m’ and charge ‘q’are suspended from a fixed point by threads of length ‘l’. What is the equilibrium separation when each threadmakes asmall angle ' $θ$ ' with the vertical ? A. $d=\left( \frac{9^{2}r}{2πsing ^{2}} \right)^{1}$ B. $d=\left( \frac{q^{2}/^{2}}{2πε_0m^{2}g} \right)^{\frac{1}{3}}$ C. $d=\left( \fra...

Stem similarity: 78.35%

#### Physics_cleaned_dataset.docx::source::19

Failures: lost_option, mcq_single_classified_as_descriptive, equation_corruption

Source: 17. A certain charge is divided into two parts mid if, How should the charges and be divided so that Ge ( - q) placed at a certain distance apari experiencesting electrostatic tepulsion? [July 26 2021(II)] (A) (B) (C) (D) [solution] Option A [Question_end] [Question_start]

Extracted: 17. A certain charge  $Q$ is divided into two parts  $q$ mid if, Howshould the charges  $Q$ and  $q$ be divided so that Ge (  $Q$ - q) placed at a certain distance apariexperiencestingelectrostatic tepulsion? A. $Q=2a$ B. $O=4π$ C. $9=39$

Stem similarity: 73.94%

#### Physics_cleaned_dataset.docx::source::20

Failures: lost_option, mcq_single_classified_as_descriptive, equation_corruption

Source: 18. Three charjes + Q.9. Oare placed respotively at (Ry) and d from the origin. on the . If the nutue experienced by , placed at , is zero, then value (1) is. [9 Jan 2019 (I)] (A) (B) (C) (D) [solution] Option A [Question_end] [Question_start]

Extracted: 18. Three charjes+ Q.9. Oare placed respotively at (Ry)  $d/2$ and d from the origin. on the  $x-2xis$ . If the nutue experienced by  $+Q$ , placed at  $x-0$ , is zero, then value (1) is. A. $+Q/2$ B. $+Q/4$ C. $O/2$

Stem similarity: 74.47%

#### Physics_cleaned_dataset.docx::source::21

Failures: lost_option, mcq_single_classified_as_descriptive, equation_corruption

Source: 19. Charge is distributed within a sphere of radius it which volume charge density where and constants. If is the total charge of this that distribution, the radius is: [9 Jan 2019 (I)] (A) (B) (C) (D) [solution] Option A [Question_end] [Question_start]

Extracted: 19. Charge is distributed within a sphere of radius itwhich volume charge density  $p(r)=\frac{A}{S}e^{-2t/4}$ where  $Λ$ and  $a$ constants. If  $Q$ is the total charge of this that distribution, the radius  $R$ is: A. $\frac{a}{2}log⁡\left( \frac{1}{1-\frac{0}{2πaA}} \right)$ B. $alog⁡\left( \frac{1}{1-\frac{Q}{2πaA}} \right)$ C. $\frac{a}{2}log⁡\left( 1-\...

Stem similarity: 75.69%

#### Physics_cleaned_dataset.docx::source::22

Failures: lost_option

Source: 20. Two identical conducting spheres A and B, carry charge. They are separated by a distance much larger their diameter, and the force between them is F A identical conducting sphere, , is uncharged. Sphere first touched to A, then to B, and then removed. Asar the force between A and B would be equal to [Online April 16, 2018] (A) (B) (C) F (D) [solution] Op...

Extracted: 20. Two identical conducting spheres A and B, carry charge. They are separated by a distance much larger their diameter, and the force between them is F A identical conducting sphere,  $C$ , is uncharged. Sphere first touched to A, then to B, and then removed. Asar the force between A and B would be equal to [Online April 16, 2018] [solution] Option A [Quest...

Stem similarity: 98.94%

#### Physics_cleaned_dataset.docx::source::23

Failures: option_merge, image_detachment

Source: 21. Shown in the figure are two point charges and inside the cavity of a spherical shell. The charges are kept near the surface of the cavity on opposite sides of the centre of the shell. If is the surface charge on the inner surface and charge on it and the surface charge on the outer and net charge on it then: [Online April 10, 2015] (A) (B) (C) (D) [solut...

Extracted: 21. Shown in the figure are two point charges  $+Q$ and  $-Q$ inside the cavity of a spherical shell. The charges are kept near the surface of the cavity on opposite sides of the centreof the shell. If  $σ_1$ is the surface charge on the inner surface and charge on it and  $σ_2$ the surface charge on the outer and  $Q_2$ net charge on it then: [Online April ...

Stem similarity: 86.23%

#### Physics_cleaned_dataset.docx::source::25

Failures: numerical_classified_as_descriptive

Source: 22. A positive ion and a negative ion has charges and , ind masses and respectively. At an instant, the ions are separated by a certain distance . At that instant the ratio of the magnitudes of electrostatic force to gravitational force is , where the value of P is _____.(Take and universal gravitational constant as ) [Jan 23, 2025 (I)] [solution] Option A [...

Extracted: 22. A positive ion  $A$ and a negative ion  $B$ has charges  $6.67=10^{19}C$ and  $9.6×10^{111}C$ , ind masses  $19.2×10^{27}kg$ and  $9=10^{-27}kg$ respectively. At an instant, the ions are separated by a certain distance  $r$ . At that instant the ratio of the magnitudes of electrostatic force to gravitational force is  $P=10^{4}$ , where the value of P is...

Stem similarity: 83.01%

#### Physics_cleaned_dataset.docx::source::31

Failures: wrong_question_boundary, stem_mismatch, option_split, numerical_classified_as_mcq_multi, image_detachment

Source: 28. As shown in the figure, a configuration of two equal charges is placed on an inclined plane. Ma each point charge is 20 g . Assume that there is no fric between charge and plane. For the system of two charges to be in equilibrium (at rest) the heighth . The value of is _____. [April 11, 2022 (II)] [solution] Option A [Question_end] Topic 1 - Electric Cha...

Extracted: 28. As shown in the figure, a configuration of two equal  $p$ charges  $\left( q_0=+2μC \right)$ is placed on an inclined plane. Ma each point charge is 20 g . Assume that there is no fric between charge and plane. For the system of two charges to be in equilibrium (at rest) the heighth  $10^{-3}m$ . The value of  $x$ is_____. [April 11, 2022 (II)] [solution...

Stem similarity: 28.17%

#### Physics_cleaned_dataset.docx::source::32

Failures: missing_question, lost_option, equation_corruption

Source: 1. Two beads, each with charge and mass , are on a horizontal, frictionless, non - conducting, circular hoop of radius R . One of the beads is glued to the hoop at some point, while the other one performs small oscillations about its equilibrium position along the hoop. The square of the angular frequency of the small oscillations is given by [ is the permit...

Extracted: 

Stem similarity: 0.00%

#### Physics_cleaned_dataset.docx::source::33

Failures: missing_question, lost_option, equation_corruption

Source: 2. Two identical non-conducting solid spheres of same mass and charge are susponded in air from a common point by two nonconducting, massless strings of same length. At equilibrium, the angle between the strings is . The splieres are now immersed in adieketric liquid of density and dielectric constant 21. If the angle between the strings remains the same aff...

Extracted: 

Stem similarity: 0.00%

#### Physics_cleaned_dataset.docx::source::34

Failures: missing_question

Source: 3. Four charges and of same magnitude are fixed along the axis at and , reppectively positive charge is placed on the positive axis at a distunce . Four options of the signs of these charges are given in List-I. The direction of the forces on the charge is given in List-II. Match List-I with List-II and select the correct answer using the code given below th...

Extracted: 

Stem similarity: 0.00%

#### Physics_cleaned_dataset.docx::source::35

Failures: missing_question

Source: 1. Q) positive: negative

Extracted: 

Stem similarity: 0.00%

#### Physics_cleaned_dataset.docx::source::36

Failures: missing_question

Source: 2. R) positive: negative

Extracted: 

Stem similarity: 0.00%

#### Physics_cleaned_dataset.docx::source::37

Failures: missing_question

Source: 3. S. positive: tregative

Extracted: 

Stem similarity: 0.00%

#### Physics_cleaned_dataset.docx::source::38

Failures: missing_question, lost_option, equation_corruption

Source: 4. Codes:(A) (B) (C) (D) P4, Q2, R1, S3 [solution] Option A [Question_end] Topic 2 - Electric Field and Field Lines 1 MCQ- with One Correct Answer [Question_start]

Extracted: 

Stem similarity: 0.00%

#### Physics_cleaned_dataset.docx::source::39

Failures: lost_option, mcq_single_classified_as_descriptive, equation_corruption, image_detachment

Source: 4. Charges and are uniformly distributed in three dielectric solid spheres 1,2 and 3 of radii and respectively, as shown in figure. If magnitude of the electric fields at point at a distance from the centre of sphere and and respectively, then [Adv, 2014] (A) (B) (C) (D) [solution] Option A [Question_end]

Extracted: 4. Charges  $Q.2Q$ and  $4Q$ are uniformly distributed in three dielectric solid spheres 1,2 and 3 of radii  $R/2,R$ and  $2R$ respectively, as shown in figure. If magnitude of the electric fields at point  $P$ at a distance  $R$ from the centre of sphere  $I,2$ and  $3areE_1,E_2$ and  $E_3$ respectively, then A. $E_3&gt;E_1&gt;E_2$ B. $E_2&gt;E_1&gt;E_3$ C....

Stem similarity: 84.92%


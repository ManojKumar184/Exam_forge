/*
  # RLS Policies for ExamForge AI
  
  Role-based access control policies matching existing schema.
*/

-- Profiles policies (id references auth.users.id directly)
CREATE POLICY "Users view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admins view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "Users update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Subjects - read only for all authenticated
CREATE POLICY "All view subjects"
  ON subjects FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins manage subjects"
  ON subjects FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Chapters
CREATE POLICY "All view chapters"
  ON chapters FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins manage chapters"
  ON chapters FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Questions
CREATE POLICY "Approved questions visible"
  ON questions FOR SELECT
  TO authenticated
  USING (
    status = 'approved' 
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'faculty'))
  );

CREATE POLICY "Admins faculty insert questions"
  ON questions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'faculty'))
  );

CREATE POLICY "Admins update questions"
  ON questions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "Admins delete questions"
  ON questions FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Papers
CREATE POLICY "View own or published papers"
  ON papers FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR status = 'published'
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "Faculty admins manage papers"
  ON papers FOR ALL
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Paper questions
CREATE POLICY "View paper questions"
  ON paper_questions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM papers 
      WHERE papers.id = paper_questions.paper_id 
      AND (papers.status = 'published' OR papers.created_by = auth.uid())
    )
  );

CREATE POLICY "Manage paper questions"
  ON paper_questions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM papers 
      WHERE papers.id = paper_questions.paper_id 
      AND papers.created_by = auth.uid()
    )
  );

-- Online tests
CREATE POLICY "View accessible tests"
  ON online_tests FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR is_public = true
    OR auth.uid() = ANY(allowed_users)
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'faculty'))
  );

CREATE POLICY "Faculty admins manage tests"
  ON online_tests FOR ALL
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'faculty'))
  );

-- Test attempts
CREATE POLICY "View own attempts"
  ON test_attempts FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'faculty'))
  );

CREATE POLICY "Students manage own attempts"
  ON test_attempts FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Test answers
CREATE POLICY "View own answers"
  ON test_answers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM test_attempts 
      WHERE test_attempts.id = test_answers.attempt_id 
      AND test_attempts.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'faculty'))
  );

CREATE POLICY "Manage own answers"
  ON test_answers FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM test_attempts 
      WHERE test_attempts.id = test_answers.attempt_id 
      AND test_attempts.user_id = auth.uid()
    )
  );

-- Leaderboard
CREATE POLICY "View leaderboard"
  ON leaderboard FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Manage leaderboard"
  ON leaderboard FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'faculty'))
  );

-- Uploads
CREATE POLICY "View own uploads"
  ON uploads FOR SELECT
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "Admins manage uploads"
  ON uploads FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Analytics
CREATE POLICY "View analytics"
  ON analytics FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'faculty'))
  );

CREATE POLICY "Admins manage analytics"
  ON analytics FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Question papers (additional table)
CREATE POLICY "View accessible question papers"
  ON question_papers FOR SELECT
  TO authenticated
  USING (
    created_by = (SELECT id FROM profiles WHERE id = auth.uid())
    OR is_published = true
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "Manage question papers"
  ON question_papers FOR ALL
  TO authenticated
  USING (
    created_by = (SELECT id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Question paper items
CREATE POLICY "View paper items"
  ON question_paper_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM question_papers 
      WHERE question_papers.id = question_paper_items.paper_id 
      AND (question_papers.is_published = true OR question_papers.created_by = (SELECT id FROM profiles WHERE id = auth.uid()))
    )
  );

CREATE POLICY "Manage paper items"
  ON question_paper_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM question_papers 
      WHERE question_papers.id = question_paper_items.paper_id 
      AND question_papers.created_by = (SELECT id FROM profiles WHERE id = auth.uid())
    )
  );

-- Question uploads
CREATE POLICY "View own uploads"
  ON question_uploads FOR SELECT
  TO authenticated
  USING (
    uploaded_by = (SELECT id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "Admins manage uploads"
  ON question_uploads FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );
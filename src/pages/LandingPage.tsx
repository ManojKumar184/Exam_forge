import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui';
import {
  GraduationCap,
  FileText,
  Brain,
  BarChart3,
  Users,
  Shield,
  Sparkles,
  Check,
  ArrowRight,
  BookOpen,
  Calculator,
  FlaskConical,
  Atom,
} from 'lucide-react';

const features = [
  {
    icon: <Brain className="w-6 h-6" />,
    title: 'AI-Powered Classification',
    description: 'Automatically classify questions by subject, chapter, difficulty, and exam type using advanced AI.',
  },
  {
    icon: <FileText className="w-6 h-6" />,
    title: 'Smart Paper Generation',
    description: 'Generate exam papers instantly with customizable difficulty distribution and topic selection.',
  },
  {
    icon: <BarChart3 className="w-6 h-6" />,
    title: 'Performance Analytics',
    description: 'Track student performance with detailed analytics and identify improvement areas.',
  },
  {
    icon: <Users className="w-6 h-6" />,
    title: 'Role-Based Access',
    description: 'Dedicated dashboards for admins, faculty, and students with appropriate permissions.',
  },
  {
    icon: <Shield className="w-6 h-6" />,
    title: 'Secure & Reliable',
    description: 'Enterprise-grade security with role-based access control and data protection.',
  },
  {
    icon: <Sparkles className="w-6 h-6" />,
    title: 'Math & Diagram Support',
    description: 'Full support for mathematical equations (LaTeX) and images in questions and papers.',
  },
];

const examTypes = [
  { name: 'NEET', icon: <BookOpen className="w-5 h-5" />, color: 'bg-green-500' },
  { name: 'JEE Main', icon: <Calculator className="w-5 h-5" />, color: 'bg-blue-500' },
  { name: 'JEE Advanced', icon: <Atom className="w-5 h-5" />, color: 'bg-slate-500' },
  { name: 'CBSE', icon: <FlaskConical className="w-5 h-5" />, color: 'bg-amber-500' },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/30">
                <GraduationCap className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold text-slate-900 dark:text-white">ExamForge AI</span>
            </div>
            <div className="flex items-center gap-4">
              <Link to="/login">
                <Button variant="ghost">Sign In</Button>
              </Link>
              <Link to="/register">
                <Button>Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" />
            AI-Powered Question Paper Generation
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 dark:text-white mb-6 leading-tight">
            Create Exam Papers
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-blue-700">
              10x Faster with AI
            </span>
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-8">
            Upload question banks, let AI classify them automatically, and generate professional
            exam papers for NEET, JEE, CBSE & State Board exams in minutes.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/register">
              <Button size="lg" rightIcon={<ArrowRight className="w-5 h-5" />}>
                Start Free Trial
              </Button>
            </Link>
            <Link to="/login">
              <Button variant="outline" size="lg">
                Watch Demo
              </Button>
            </Link>
          </div>
          <div className="mt-12 flex items-center justify-center gap-8 text-sm text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-500" />
              No credit card required
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-500" />
              Free for teachers
            </div>
          </div>
        </div>
      </section>

      {/* Supported Exams */}
      <section className="py-16 px-4 bg-slate-50 dark:bg-slate-800/50">
        <div className="max-w-7xl mx-auto">
          <p className="text-center text-sm font-medium text-slate-500 dark:text-slate-400 mb-6">
            SUPPORTED EXAM TYPES
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8">
            {examTypes.map((exam) => (
              <div
                key={exam.name}
                className="flex items-center gap-3 px-6 py-3 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700"
              >
                <div className={`p-2 rounded-lg ${exam.color} text-white`}>{exam.icon}</div>
                <span className="font-semibold text-slate-900 dark:text-white">{exam.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
              Everything You Need for Exam Preparation
            </h2>
            <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              From question upload to paper generation to online tests - all in one platform.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <div
                key={index}
                className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-600 transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-3xl p-8 sm:p-12 text-center shadow-2xl shadow-blue-500/30">
            <h2 className="text-3xl font-bold text-white mb-4">
              Ready to Transform Your Exam Preparation?
            </h2>
            <p className="text-blue-100 mb-8 max-w-xl mx-auto">
              Join thousands of educators using ExamForge AI to create better exams faster.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/register">
                <Button
                  variant="secondary"
                  size="lg"
                  rightIcon={<ArrowRight className="w-5 h-5" />}
                >
                  Get Started Free
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-blue-400" />
              </div>
              <span className="font-semibold text-white">ExamForge AI</span>
            </div>
            <p className="text-sm">
              &copy; {new Date().getFullYear()} ExamForge AI. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

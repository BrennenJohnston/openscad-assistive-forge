/**
 * Unit tests for saved-projects-manager
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  initSavedProjectsDB,
  listSavedProjects,
  saveProject,
  getProject,
  touchProject,
  updateProject,
  deleteProject,
  getSavedProjectsSummary,
  clearAllSavedProjects,
} from '../../src/js/saved-projects-manager.js';

// Mock IndexedDB
const mockIndexedDB = {
  databases: {},
  open: vi.fn(),
};

describe('Saved Projects Manager', () => {
  beforeEach(async () => {
    // Clear localStorage
    localStorage.clear();
    
    // Clear any IndexedDB mocks
    mockIndexedDB.databases = {};
    
    // Initialize saved projects DB
    await initSavedProjectsDB();
    
    // Clear all projects
    await clearAllSavedProjects();
  });

  describe('initSavedProjectsDB', () => {
    it('should initialize successfully', async () => {
      const result = await initSavedProjectsDB();
      expect(result).toHaveProperty('available');
      expect(result).toHaveProperty('type');
      expect(result.available).toBe(true);
      expect(['indexeddb', 'localstorage']).toContain(result.type);
    });
  });

  describe('saveProject', () => {
    it('should save a project successfully', async () => {
      const projectData = {
        name: 'Test Project',
        originalName: 'test.scad',
        kind: 'scad',
        mainFilePath: 'test.scad',
        content: '// Test SCAD content',
        notes: 'Test notes',
      };

      const result = await saveProject(projectData);
      
      expect(result.success).toBe(true);
      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe('string');
    });

    it('should validate project size limits', async () => {
      const largeContent = 'x'.repeat(6 * 1024 * 1024); // 6MB (exceeds 5MB limit)
      
      const projectData = {
        name: 'Large Project',
        originalName: 'large.scad',
        kind: 'scad',
        mainFilePath: 'large.scad',
        content: largeContent,
        notes: '',
      };

      const result = await saveProject(projectData);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds maximum size');
    });

    it('should enforce project count limit', async () => {
      // Save 25 projects (the limit)
      for (let i = 0; i < 25; i++) {
        await saveProject({
          name: `Project ${i}`,
          originalName: `project-${i}.scad`,
          kind: 'scad',
          mainFilePath: `project-${i}.scad`,
          content: `// Project ${i}`,
          notes: '',
        });
      }

      // Try to save one more
      const result = await saveProject({
        name: 'Project 26',
        originalName: 'project-26.scad',
        kind: 'scad',
        mainFilePath: 'project-26.scad',
        content: '// Project 26',
        notes: '',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Maximum saved projects limit reached');
    });

    it('should validate notes length', async () => {
      const longNotes = 'x'.repeat(5001); // Exceeds 5000 char limit
      
      const projectData = {
        name: 'Test Project',
        originalName: 'test.scad',
        kind: 'scad',
        mainFilePath: 'test.scad',
        content: '// Test',
        notes: longNotes,
      };

      const result = await saveProject(projectData);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should save ZIP projects with projectFiles', async () => {
      const projectData = {
        name: 'Test ZIP Project',
        originalName: 'test.zip',
        kind: 'zip',
        mainFilePath: 'main.scad',
        content: '// Main file',
        projectFiles: {
          'main.scad': '// Main file',
          'lib/helper.scad': '// Helper',
        },
        notes: 'ZIP project',
      };

      const result = await saveProject(projectData);
      
      expect(result.success).toBe(true);
      expect(result.id).toBeDefined();
    });
  });

  describe('listSavedProjects', () => {
    it('should return empty array when no projects exist', async () => {
      const projects = await listSavedProjects();
      expect(projects).toEqual([]);
    });

    it('should list all saved projects', async () => {
      // Save multiple projects
      await saveProject({
        name: 'Project 1',
        originalName: 'p1.scad',
        kind: 'scad',
        mainFilePath: 'p1.scad',
        content: '// P1',
        notes: '',
      });

      await saveProject({
        name: 'Project 2',
        originalName: 'p2.scad',
        kind: 'scad',
        mainFilePath: 'p2.scad',
        content: '// P2',
        notes: '',
      });

      const projects = await listSavedProjects();
      
      expect(projects).toHaveLength(2);
      expect(projects[0].name).toBeDefined();
      expect(projects[0].savedAt).toBeDefined();
    });

    it('should sort projects by lastLoadedAt descending', async () => {
      const project1 = await saveProject({
        name: 'Project 1',
        originalName: 'p1.scad',
        kind: 'scad',
        mainFilePath: 'p1.scad',
        content: '// P1',
        notes: '',
      });

      // Wait a bit to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      const project2 = await saveProject({
        name: 'Project 2',
        originalName: 'p2.scad',
        kind: 'scad',
        mainFilePath: 'p2.scad',
        content: '// P2',
        notes: '',
      });

      // Wait to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Touch project 1 (make it more recent)
      await touchProject(project1.id);

      const projects = await listSavedProjects();
      
      expect(projects[0].id).toBe(project1.id);
      expect(projects[1].id).toBe(project2.id);
    });
  });

  describe('getProject', () => {
    it('should retrieve a project by ID', async () => {
      const saved = await saveProject({
        name: 'Test Project',
        originalName: 'test.scad',
        kind: 'scad',
        mainFilePath: 'test.scad',
        content: '// Test content',
        notes: 'Test notes',
      });

      const project = await getProject(saved.id);
      
      expect(project).toBeDefined();
      expect(project.id).toBe(saved.id);
      expect(project.name).toBe('Test Project');
      expect(project.content).toBe('// Test content');
      expect(project.notes).toBe('Test notes');
    });

    it('should return null for non-existent project', async () => {
      const project = await getProject('non-existent-id');
      expect(project).toBeNull();
    });

    it('should parse projectFiles for ZIP projects', async () => {
      const saved = await saveProject({
        name: 'ZIP Project',
        originalName: 'test.zip',
        kind: 'zip',
        mainFilePath: 'main.scad',
        content: '// Main',
        projectFiles: {
          'main.scad': '// Main',
          'lib.scad': '// Lib',
        },
        notes: '',
      });

      const project = await getProject(saved.id);
      
      expect(project.projectFiles).toBeDefined();
      expect(typeof project.projectFiles).toBe('object');
      expect(project.projectFiles['lib.scad']).toBe('// Lib');
    });
  });

  describe('touchProject', () => {
    it('should update lastLoadedAt timestamp', async () => {
      const saved = await saveProject({
        name: 'Test Project',
        originalName: 'test.scad',
        kind: 'scad',
        mainFilePath: 'test.scad',
        content: '// Test',
        notes: '',
      });

      const originalProject = await getProject(saved.id);
      const originalTimestamp = originalProject.lastLoadedAt;

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      await touchProject(saved.id);

      const updatedProject = await getProject(saved.id);
      
      expect(updatedProject.lastLoadedAt).toBeGreaterThan(originalTimestamp);
    });

    it('should return false for non-existent project', async () => {
      const result = await touchProject('non-existent-id');
      expect(result).toBe(false);
    });
  });

  describe('updateProject', () => {
    it('should update project name', async () => {
      const saved = await saveProject({
        name: 'Original Name',
        originalName: 'test.scad',
        kind: 'scad',
        mainFilePath: 'test.scad',
        content: '// Test',
        notes: '',
      });

      const result = await updateProject({
        id: saved.id,
        name: 'Updated Name',
      });

      expect(result.success).toBe(true);

      const project = await getProject(saved.id);
      expect(project.name).toBe('Updated Name');
    });

    it('should update project notes', async () => {
      const saved = await saveProject({
        name: 'Test Project',
        originalName: 'test.scad',
        kind: 'scad',
        mainFilePath: 'test.scad',
        content: '// Test',
        notes: 'Original notes',
      });

      const result = await updateProject({
        id: saved.id,
        notes: 'Updated notes with https://example.com',
      });

      expect(result.success).toBe(true);

      const project = await getProject(saved.id);
      expect(project.notes).toBe('Updated notes with https://example.com');
    });

    it('should reject notes exceeding length limit', async () => {
      const saved = await saveProject({
        name: 'Test Project',
        originalName: 'test.scad',
        kind: 'scad',
        mainFilePath: 'test.scad',
        content: '// Test',
        notes: '',
      });

      const longNotes = 'x'.repeat(5001);
      const result = await updateProject({
        id: saved.id,
        notes: longNotes,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('exceed maximum length');
    });

    it('should return error for non-existent project', async () => {
      const result = await updateProject({
        id: 'non-existent-id',
        name: 'New Name',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Project not found');
    });
  });

  describe('deleteProject', () => {
    it('should delete a project successfully', async () => {
      const saved = await saveProject({
        name: 'Test Project',
        originalName: 'test.scad',
        kind: 'scad',
        mainFilePath: 'test.scad',
        content: '// Test',
        notes: '',
      });

      const result = await deleteProject(saved.id);
      expect(result.success).toBe(true);

      const project = await getProject(saved.id);
      expect(project).toBeNull();
    });

    it('should handle deletion of non-existent project gracefully', async () => {
      const result = await deleteProject('non-existent-id');
      // Should succeed (idempotent)
      expect(result.success).toBe(true);
    });
  });

  describe('getSavedProjectsSummary', () => {
    it('should return zero count for no projects', async () => {
      const summary = await getSavedProjectsSummary();
      
      expect(summary.count).toBe(0);
      expect(summary.totalApproxBytes).toBe(0);
    });

    it('should return correct count and approximate size', async () => {
      await saveProject({
        name: 'Project 1',
        originalName: 'p1.scad',
        kind: 'scad',
        mainFilePath: 'p1.scad',
        content: '// P1',
        notes: 'Notes 1',
      });

      await saveProject({
        name: 'Project 2',
        originalName: 'p2.scad',
        kind: 'scad',
        mainFilePath: 'p2.scad',
        content: '// P2',
        notes: 'Notes 2',
      });

      const summary = await getSavedProjectsSummary();
      
      expect(summary.count).toBe(2);
      expect(summary.totalApproxBytes).toBeGreaterThan(0);
    });
  });

  describe('clearAllSavedProjects', () => {
    it('should clear all saved projects', async () => {
      // Save multiple projects
      await saveProject({
        name: 'Project 1',
        originalName: 'p1.scad',
        kind: 'scad',
        mainFilePath: 'p1.scad',
        content: '// P1',
        notes: '',
      });

      await saveProject({
        name: 'Project 2',
        originalName: 'p2.scad',
        kind: 'scad',
        mainFilePath: 'p2.scad',
        content: '// P2',
        notes: '',
      });

      const result = await clearAllSavedProjects();
      expect(result.success).toBe(true);

      const projects = await listSavedProjects();
      expect(projects).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty notes', async () => {
      const result = await saveProject({
        name: 'Project',
        originalName: 'test.scad',
        kind: 'scad',
        mainFilePath: 'test.scad',
        content: '// Test',
        notes: '',
      });

      expect(result.success).toBe(true);

      const project = await getProject(result.id);
      expect(project.notes).toBe('');
    });

    it('should handle special characters in names', async () => {
      const result = await saveProject({
        name: 'Project with "quotes" & <tags>',
        originalName: 'test.scad',
        kind: 'scad',
        mainFilePath: 'test.scad',
        content: '// Test',
        notes: 'Notes with special chars: @#$%',
      });

      expect(result.success).toBe(true);

      const project = await getProject(result.id);
      expect(project.name).toBe('Project with "quotes" & <tags>');
      expect(project.notes).toBe('Notes with special chars: @#$%');
    });

    it('should handle Unicode characters', async () => {
      const result = await saveProject({
        name: 'プロジェクト 项目 🚀',
        originalName: 'test.scad',
        kind: 'scad',
        mainFilePath: 'test.scad',
        content: '// Unicode: 你好',
        notes: 'Notes: Привет 🎉',
      });

      expect(result.success).toBe(true);

      const project = await getProject(result.id);
      expect(project.name).toBe('プロジェクト 项目 🚀');
      expect(project.notes).toBe('Notes: Привет 🎉');
    });
  });
});

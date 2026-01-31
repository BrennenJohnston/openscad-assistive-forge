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
  // v2: Folder operations
  createFolder,
  getFolder,
  listFolders,
  renameFolder,
  deleteFolder,
  moveFolder,
  getFolderTree,
  getFolderBreadcrumbs,
  // v2: Project-folder operations
  moveProject,
  getProjectsInFolder,
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

  // ============================================================================
  // Folder Operations Tests (v2)
  // ============================================================================

  describe('Folder Operations (v2)', () => {
    describe('createFolder', () => {
      it('should create a folder successfully', async () => {
        const result = await createFolder({ name: 'Test Folder' });
        
        expect(result.success).toBe(true);
        expect(result.id).toBeDefined();
        expect(typeof result.id).toBe('string');
        expect(result.id.startsWith('folder-')).toBe(true);
      });

      it('should create a nested folder', async () => {
        const parent = await createFolder({ name: 'Parent Folder' });
        expect(parent.success).toBe(true);

        const child = await createFolder({
          name: 'Child Folder',
          parentId: parent.id,
        });

        expect(child.success).toBe(true);

        const childFolder = await getFolder(child.id);
        expect(childFolder.parentId).toBe(parent.id);
      });

      it('should reject empty folder name', async () => {
        const result = await createFolder({ name: '' });
        
        expect(result.success).toBe(false);
        expect(result.error).toContain('required');
      });

      it('should reject folder with non-existent parent', async () => {
        const result = await createFolder({
          name: 'Orphan',
          parentId: 'non-existent-id',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Parent folder not found');
      });
    });

    describe('getFolder', () => {
      it('should retrieve a folder by ID', async () => {
        const created = await createFolder({ name: 'Test Folder', color: '#FF0000' });
        
        const folder = await getFolder(created.id);
        
        expect(folder).toBeDefined();
        expect(folder.id).toBe(created.id);
        expect(folder.name).toBe('Test Folder');
        expect(folder.color).toBe('#FF0000');
      });

      it('should return null for non-existent folder', async () => {
        const folder = await getFolder('non-existent-id');
        expect(folder).toBeNull();
      });
    });

    describe('listFolders', () => {
      it('should return empty array when no folders exist', async () => {
        const folders = await listFolders();
        expect(folders).toEqual([]);
      });

      it('should list all folders', async () => {
        await createFolder({ name: 'Folder 1' });
        await createFolder({ name: 'Folder 2' });

        const folders = await listFolders();
        
        expect(folders).toHaveLength(2);
      });
    });

    describe('renameFolder', () => {
      it('should rename a folder', async () => {
        const created = await createFolder({ name: 'Original Name' });
        
        const result = await renameFolder(created.id, 'New Name');
        expect(result.success).toBe(true);

        const folder = await getFolder(created.id);
        expect(folder.name).toBe('New Name');
      });

      it('should reject empty name', async () => {
        const created = await createFolder({ name: 'Test' });
        
        const result = await renameFolder(created.id, '');
        expect(result.success).toBe(false);
      });
    });

    describe('deleteFolder', () => {
      it('should delete an empty folder', async () => {
        const created = await createFolder({ name: 'To Delete' });
        
        const result = await deleteFolder(created.id);
        expect(result.success).toBe(true);

        const folder = await getFolder(created.id);
        expect(folder).toBeNull();
      });

      it('should move contents to root when deleting folder with projects', async () => {
        const folder = await createFolder({ name: 'Folder' });
        
        const project = await saveProject({
          name: 'Project in Folder',
          originalName: 'test.scad',
          kind: 'scad',
          mainFilePath: 'test.scad',
          content: '// Test',
          notes: '',
          folderId: folder.id,
        });

        await deleteFolder(folder.id, false); // Don't delete contents

        const updatedProject = await getProject(project.id);
        expect(updatedProject.folderId).toBeNull(); // Moved to root
      });
    });

    describe('moveFolder', () => {
      it('should move a folder to a new parent', async () => {
        const parent1 = await createFolder({ name: 'Parent 1' });
        const parent2 = await createFolder({ name: 'Parent 2' });
        const child = await createFolder({ name: 'Child', parentId: parent1.id });

        const result = await moveFolder(child.id, parent2.id);
        expect(result.success).toBe(true);

        const movedFolder = await getFolder(child.id);
        expect(movedFolder.parentId).toBe(parent2.id);
      });

      it('should prevent moving folder into itself', async () => {
        const folder = await createFolder({ name: 'Self' });
        
        const result = await moveFolder(folder.id, folder.id);
        expect(result.success).toBe(false);
        expect(result.error).toContain('Cannot move folder into itself');
      });

      it('should prevent moving folder into its descendant', async () => {
        const parent = await createFolder({ name: 'Parent' });
        const child = await createFolder({ name: 'Child', parentId: parent.id });
        
        const result = await moveFolder(parent.id, child.id);
        expect(result.success).toBe(false);
        expect(result.error).toContain('Cannot move folder into itself');
      });
    });

    describe('getFolderTree', () => {
      it('should return hierarchical folder structure', async () => {
        await createFolder({ name: 'Root Folder' });
        const project = await saveProject({
          name: 'Root Project',
          originalName: 'test.scad',
          kind: 'scad',
          mainFilePath: 'test.scad',
          content: '// Test',
          notes: '',
        });

        const tree = await getFolderTree();
        
        expect(tree.folders).toHaveLength(1);
        expect(tree.rootProjects).toBeDefined();
      });
    });

    describe('getFolderBreadcrumbs', () => {
      it('should return folder path from root to current', async () => {
        const parent = await createFolder({ name: 'Parent' });
        const child = await createFolder({ name: 'Child', parentId: parent.id });
        const grandchild = await createFolder({ name: 'Grandchild', parentId: child.id });

        const breadcrumbs = await getFolderBreadcrumbs(grandchild.id);
        
        expect(breadcrumbs).toHaveLength(3);
        expect(breadcrumbs[0].name).toBe('Parent');
        expect(breadcrumbs[1].name).toBe('Child');
        expect(breadcrumbs[2].name).toBe('Grandchild');
      });
    });
  });

  describe('Project-Folder Operations (v2)', () => {
    describe('moveProject', () => {
      it('should move a project to a folder', async () => {
        const folder = await createFolder({ name: 'Destination' });
        const project = await saveProject({
          name: 'Project',
          originalName: 'test.scad',
          kind: 'scad',
          mainFilePath: 'test.scad',
          content: '// Test',
          notes: '',
        });

        const result = await moveProject(project.id, folder.id);
        expect(result.success).toBe(true);

        const updatedProject = await getProject(project.id);
        expect(updatedProject.folderId).toBe(folder.id);
      });

      it('should move a project to root (null folder)', async () => {
        const folder = await createFolder({ name: 'Source' });
        const project = await saveProject({
          name: 'Project',
          originalName: 'test.scad',
          kind: 'scad',
          mainFilePath: 'test.scad',
          content: '// Test',
          notes: '',
          folderId: folder.id,
        });

        const result = await moveProject(project.id, null);
        expect(result.success).toBe(true);

        const updatedProject = await getProject(project.id);
        expect(updatedProject.folderId).toBeNull();
      });
    });

    describe('getProjectsInFolder', () => {
      it('should return projects in a specific folder', async () => {
        const folder = await createFolder({ name: 'Folder' });
        
        await saveProject({
          name: 'Project 1',
          originalName: 'p1.scad',
          kind: 'scad',
          mainFilePath: 'p1.scad',
          content: '// P1',
          notes: '',
          folderId: folder.id,
        });

        await saveProject({
          name: 'Project 2',
          originalName: 'p2.scad',
          kind: 'scad',
          mainFilePath: 'p2.scad',
          content: '// P2',
          notes: '',
        }); // Root level

        const projects = await getProjectsInFolder(folder.id);
        
        expect(projects).toHaveLength(1);
        expect(projects[0].name).toBe('Project 1');
      });

      it('should return root projects when folderId is null', async () => {
        await saveProject({
          name: 'Root Project',
          originalName: 'root.scad',
          kind: 'scad',
          mainFilePath: 'root.scad',
          content: '// Root',
          notes: '',
        });

        const folder = await createFolder({ name: 'Folder' });
        await saveProject({
          name: 'Folder Project',
          originalName: 'folder.scad',
          kind: 'scad',
          mainFilePath: 'folder.scad',
          content: '// Folder',
          notes: '',
          folderId: folder.id,
        });

        const projects = await getProjectsInFolder(null);
        
        expect(projects).toHaveLength(1);
        expect(projects[0].name).toBe('Root Project');
      });
    });

    describe('saveProject with folderId', () => {
    it('should save project with folder assignment', async () => {
      const folder = await createFolder({ name: 'My Folder' });
      
      const result = await saveProject({
        name: 'Project',
        originalName: 'test.scad',
        kind: 'scad',
        mainFilePath: 'test.scad',
        content: '// Test',
        notes: '',
        folderId: folder.id,
      });

      expect(result.success).toBe(true);

      const project = await getProject(result.id);
      expect(project.folderId).toBe(folder.id);
    });
  });

  describe('Duplicate Name Handling', () => {
    it('should auto-increment name when saving duplicate', async () => {
      // Save first project
      const result1 = await saveProject({
        name: 'example.scad',
        originalName: 'example.scad',
        kind: 'scad',
        mainFilePath: 'example.scad',
        content: '// First',
        notes: '',
      });
      expect(result1.success).toBe(true);

      // Save second project with same name - should get (2)
      const result2 = await saveProject({
        name: 'example.scad',
        originalName: 'example.scad',
        kind: 'scad',
        mainFilePath: 'example.scad',
        content: '// Second',
        notes: '',
      });
      expect(result2.success).toBe(true);

      const project2 = await getProject(result2.id);
      expect(project2.name).toBe('example.scad (2)');

      // Save third project with same name - should get (3)
      const result3 = await saveProject({
        name: 'example.scad',
        originalName: 'example.scad',
        kind: 'scad',
        mainFilePath: 'example.scad',
        content: '// Third',
        notes: '',
      });
      expect(result3.success).toBe(true);

      const project3 = await getProject(result3.id);
      expect(project3.name).toBe('example.scad (3)');
    });

    it('should handle unique names without modification', async () => {
      const result = await saveProject({
        name: 'unique-project.scad',
        originalName: 'unique-project.scad',
        kind: 'scad',
        mainFilePath: 'unique-project.scad',
        content: '// Unique',
        notes: '',
      });

      expect(result.success).toBe(true);

      const project = await getProject(result.id);
      expect(project.name).toBe('unique-project.scad');
    });

    it('should correctly find next available number', async () => {
      // Save project 1
      await saveProject({
        name: 'test.scad',
        originalName: 'test.scad',
        kind: 'scad',
        mainFilePath: 'test.scad',
        content: '// 1',
        notes: '',
      });

      // Save project 2 - gets (2)
      await saveProject({
        name: 'test.scad',
        originalName: 'test.scad',
        kind: 'scad',
        mainFilePath: 'test.scad',
        content: '// 2',
        notes: '',
      });

      // Save project 3 - gets (3)
      await saveProject({
        name: 'test.scad',
        originalName: 'test.scad',
        kind: 'scad',
        mainFilePath: 'test.scad',
        content: '// 3',
        notes: '',
      });

      // Save project 4 - should get (4) not (2)
      const result4 = await saveProject({
        name: 'test.scad',
        originalName: 'test.scad',
        kind: 'scad',
        mainFilePath: 'test.scad',
        content: '// 4',
        notes: '',
      });

      const project4 = await getProject(result4.id);
      expect(project4.name).toBe('test.scad (4)');
    });
  });
});
});

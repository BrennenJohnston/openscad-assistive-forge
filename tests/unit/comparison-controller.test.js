import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ComparisonController } from '../../src/js/comparison-controller.js'

describe('ComparisonController', () => {
  let renderController
  let controller

  beforeEach(() => {
    renderController = {
      render: vi.fn().mockResolvedValue({
        stl: new ArrayBuffer(2),
        stats: { triangles: 10 }
      })
    }
    controller = new ComparisonController({}, renderController, { maxVariants: 2 })
    controller.setProject('cube(1);')
  })

  it('adds variants and enforces max capacity', () => {
    const id1 = controller.addVariant('First', { width: 1 })
    const id2 = controller.addVariant('Second', { width: 2 })

    expect(id1).toMatch(/variant-\d+/)
    expect(controller.getVariantCount()).toBe(2)
    expect(controller.isAtMaxCapacity()).toBe(true)
    expect(() => controller.addVariant('Third', { width: 3 })).toThrow('Maximum 2 variants allowed')
    expect(id2).toMatch(/variant-\d+/)
  })

  it('updates variant parameters and state', () => {
    const id = controller.addVariant('Variant', { width: 1 })
    controller.updateVariantParameters(id, { width: 5 })

    const variant = controller.getVariant(id)
    expect(variant.parameters.width).toBe(5)
    expect(variant.state).toBe('pending')
    expect(variant.stl).toBeNull()
  })

  it('renders a variant and updates state', async () => {
    const id = controller.addVariant('Variant', { width: 1 })

    await controller.renderVariant(id)

    const variant = controller.getVariant(id)
    expect(variant.state).toBe('complete')
    expect(variant.stl).toBeDefined()
    expect(renderController.render).toHaveBeenCalled()
  })

  it('marks variant as error when render fails', async () => {
    renderController.render.mockRejectedValueOnce(new Error('Boom'))
    const id = controller.addVariant('Variant', { width: 1 })

    await expect(controller.renderVariant(id)).rejects.toThrow('Boom')
    expect(controller.getVariant(id).state).toBe('error')
  })

  it('renders all pending variants sequentially', async () => {
    const id1 = controller.addVariant('One', { width: 1 })
    const id2 = controller.addVariant('Two', { width: 2 })

    await controller.renderAllVariants()

    expect(controller.getVariant(id1).state).toBe('complete')
    expect(controller.getVariant(id2).state).toBe('complete')
  })

  it('exports and imports comparison data', () => {
    controller.addVariant('One', { width: 1 })
    const exported = controller.exportComparison()

    controller.clearAll()
    controller.importComparison(exported)

    expect(controller.getVariantCount()).toBe(1)
    expect(controller.getAllVariants()[0].name).toBe('One')
  })

  it('calculates comparison statistics', () => {
    const id1 = controller.addVariant('One', { width: 1 })
    const id2 = controller.addVariant('Two', { width: 2 })
    controller.updateVariant(id1, { state: 'complete', stats: { triangles: 5 } })
    controller.updateVariant(id2, { state: 'error', stats: null })

    const stats = controller.getStatistics()
    expect(stats.total).toBe(2)
    expect(stats.complete).toBe(1)
    expect(stats.error).toBe(1)
    expect(stats.totalTriangles).toBe(5)
  })

  it('supports subscribing and clearing variants', () => {
    const listener = vi.fn()
    controller.subscribe(listener)

    const id = controller.addVariant('One', { width: 1 })
    controller.clearAll()

    expect(listener).toHaveBeenCalledWith('add', expect.objectContaining({ id }))
    expect(listener).toHaveBeenCalledWith('clear', { ids: [id] })
  })
})

import {expect,it,vi} from 'vitest'
import {closeTopSurface,registerBackSurface} from './overlay-back'
it('closes the last opened panel before its parent and consumes blocked back requests',()=>{const parent=vi.fn(),child=vi.fn();const removeParent=registerBackSurface('parent',parent),removeChild=registerBackSurface('child',child);expect(closeTopSurface()).toBe(true);expect(child).toHaveBeenCalledOnce();expect(parent).not.toHaveBeenCalled();removeChild();expect(closeTopSurface()).toBe(true);expect(parent).toHaveBeenCalledOnce();removeParent();expect(closeTopSurface()).toBe(false)})

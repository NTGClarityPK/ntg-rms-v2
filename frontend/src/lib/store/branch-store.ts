import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface BranchState {
  selectedBranchId: string | null;
  setSelectedBranchId: (branchId: string | null) => void;
}

export const useBranchStore = create<BranchState>()(
  persist(
    (set) => ({
      selectedBranchId: null,
      setSelectedBranchId: (branchId) => set({ selectedBranchId: branchId }),
    }),
    {
      name: 'rms-branch-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);


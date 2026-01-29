import { clearPreparationList } from '../../utils/db'

export default defineEventHandler(() => {
  clearPreparationList()
  return { success: true }
})

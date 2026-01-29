import { getPreparationList } from '../../utils/db'

export default defineEventHandler(() => {
  return getPreparationList()
})

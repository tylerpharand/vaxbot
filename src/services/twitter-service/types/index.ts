export interface Tweet {
  id: number
  id_str: string
  text: string
  user: {
    id: number
    id_str: string
    screen_name: string
  }
}

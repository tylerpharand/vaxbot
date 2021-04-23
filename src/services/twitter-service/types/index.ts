export interface Tweet {
  id: number
  id_str: string
  text: string
  in_reply_to_status_id_str: string,
  in_reply_to_user_id_str: string,
  user: {
    id: number
    id_str: string
    screen_name: string
  }
}

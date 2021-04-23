import {
  Entity,
  PrimaryColumn,
  Column,
} from "typeorm"

@Entity()
export class MentionsCursor {

    @PrimaryColumn()
    name: string

    @Column()
    cursor: string
}

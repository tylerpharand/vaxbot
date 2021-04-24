import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from "typeorm"

@Entity()
export class Subscription {

    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column()
    userId: string

    @Column()
    username: string

    @Column()
    postalCode: string

    @Column()
    tweetId: string

    @Column()
    confirmed: boolean
}

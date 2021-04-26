import _ from 'lodash'
import { getRepository } from 'typeorm'
import { Subscription } from '../../entity/Subscription.entity'

export class MetricsService {

    constructor() {}

    /**
     * 
     * Go through database and calculate metrics
     * 
     */
    public async checkMetrics() {
        const totalSubscriptions = await getRepository(Subscription).count()

        // The returned keys lose their camelCase
        const postalCodeBreakdown = await getRepository(Subscription)
            .createQueryBuilder('subscription')
            .select("subscription.postalCode AS postalCode")
            .addSelect("COUNT(*) AS count")
            .groupBy("subscription.postalCode")
            .getRawMany();

        return {
            totalSubscriptions,
            postalCodeBreakdown: _.sortBy(postalCodeBreakdown, 'postalcode'),
        }
    }
}

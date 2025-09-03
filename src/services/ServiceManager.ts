import { IService } from "./Service";
import { AdsbDb } from '../services/AdsbDb';
import { FlightAware } from '../services/FlightAware';

class ServiceManager {
    public services: IService[] = [];

    public async init(enabledServices: string): Promise<void> {
        await this.setupServicesFromEnabledServices(enabledServices);
    }

    public async setupServicesFromEnabledServices(enabledServices: string): Promise<void> {
        const serviceList = enabledServices.trim().split(',');
        for await (const service of serviceList) {
            let serviceInstance;
            switch(service.trim().toLowerCase()) {
                case 'flightaware':
                    serviceInstance = new FlightAware();
                    break;
                case 'adsbdb':
                    serviceInstance = new AdsbDb();
                    break;
            }

            if(!serviceInstance) {
                continue;
            }

            await serviceInstance?.init();
            this.services.push(serviceInstance);
        }
    }
}

export default new ServiceManager();

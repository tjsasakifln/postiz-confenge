import { Injectable } from '@nestjs/common';
import { InstagramAudienceProvider, InstagramStandaloneAudienceProvider } from './instagram.audience.provider';
import { StudioAudienceProvider } from './studio.audience.provider';
import { YoutubeAudienceProvider } from './youtube.audience.provider';

@Injectable()
export class StudioAudienceManager {
  private readonly providers: StudioAudienceProvider[] = [
    new YoutubeAudienceProvider(),
    new InstagramAudienceProvider(),
    new InstagramStandaloneAudienceProvider(),
  ];

  get(identifier: string): StudioAudienceProvider | undefined {
    return this.providers.find(provider => provider.identifier === identifier);
  }
}

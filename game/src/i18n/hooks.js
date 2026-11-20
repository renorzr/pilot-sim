import {useSyncExternalStore} from 'react';
import {getLanguage,subscribeLanguage} from './index.js';
export const useLanguage=()=>useSyncExternalStore(subscribeLanguage,getLanguage,getLanguage);

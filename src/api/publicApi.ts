import axios from 'axios';
import { API_BASE_URL } from './baseUrl';

export const publicAPI = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    // `Accept: application/json` shart — batafsili `api.ts`dagi izohga
    // qarang (bo'lmasa backend JSON xato o'rniga HTML redirect qaytaradi).
    Accept: 'application/json',
  },
});

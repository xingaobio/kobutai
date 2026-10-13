import { mount } from 'svelte';
import '@/lib/ui/theme.css';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });

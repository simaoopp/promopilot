import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from './App';
import { useAuth } from './context/AuthContext';
jest.mock('./context/AuthContext',()=>({useAuth:jest.fn()}));
jest.mock('./components/Sidebar',()=>()=>null);
jest.mock('./components/GlobalSellerAssistant',()=>()=>null);
jest.mock('./components/ForcePasswordChangeModal',()=>()=>null);
jest.mock('./components/PasswordRecoveryModal',()=>()=>null);
let container, root;
function Location(){const l=useLocation();return <output data-location>{l.pathname}{l.search}{l.hash}</output>}
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;useAuth.mockReturnValue({user:null,loadingAuth:false,loadingProfile:false,onboardingRequired:false,passwordRecovery:false,signIn:jest.fn()});container=document.createElement('div');document.body.append(container);root=createRoot(container)});
afterEach(async()=>{await act(async()=>root.unmount());container.remove()});
async function render(path){await act(async()=>{root.render(<MemoryRouter initialEntries={[path]} future={{v7_startTransition:true,v7_relativeSplatPath:true}}><App/><Location/></MemoryRouter>)});await act(async()=>{await new Promise(r=>setTimeout(r,40))})}
test('root presents product even while authentication loads',async()=>{useAuth.mockReturnValue({loadingAuth:true});await render('/');expect(container.querySelector('h1').textContent).toContain('Menos tarefas.');expect(container.querySelectorAll('a[href^="mailto:geral@promopilot.pt"]').length).toBeGreaterThan(1)});
test('root remains public for existing customers',async()=>{useAuth.mockReturnValue({user:{id:'test'}});await render('/');expect(container.querySelector('h1').textContent).toContain('Menos tarefas.')});
test('legacy route preserves fragment',async()=>{await render('/apresentacao#planos');expect(container.querySelector('[data-location]').textContent).toBe('/#planos')});
test('feature buttons switch content',async()=>{await render('/');const button=[...container.querySelectorAll('button')].find(b=>b.textContent==='Propostas');await act(async()=>button.click());expect(container.textContent).toContain('Apresente com confiança.');expect(button.getAttribute('aria-pressed')).toBe('true')});
test('login is focused and password toggle works',async()=>{await render('/login');expect(container.querySelector('h1').textContent).toBe('Bem-vindo de volta.');expect(container.querySelector('.pp-login-intro')).toBeNull();await act(async()=>container.querySelector('[aria-label="Mostrar palavra-passe"]').click());expect(container.querySelector('#senha').type).toBe('text');expect(container.querySelector('.pp-access-back').getAttribute('href')).toBe('/')});

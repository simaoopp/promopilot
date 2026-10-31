import {authIssue,classifyAuthError,logAuthIssue} from "./authErrors";
test("a Supabase Auth 403 is not misreported as authenticated organization access",()=>{
 const result=classifyAuthError({name:"AuthApiError",status:403,code:"user_banned",__isAuthError:true});
 expect(result.kind).toBe("auth_error");expect(result.message).not.toContain("está autenticada");
 expect(classifyAuthError(authIssue("PERMISSION_DENIED",403)).kind).toBe("permission_error");
});
test("upstream errors cannot impersonate a trusted error or leak their message in logs",()=>{
 const spy=jest.spyOn(console,"warn").mockImplementation(()=>{});
 const error={name:"AuthIssue",code:"secret-token",message:"private-password",status:"refresh-token"};
 expect(classifyAuthError(error).message).not.toContain("private-password");logAuthIssue("session.test",error);
 expect(JSON.stringify(spy.mock.calls)).not.toMatch(/private-password|secret-token|refresh-token/);spy.mockRestore();
});

import {getProfile} from "./profileService";
import {supabase} from "../lib/supabase";
jest.mock("../lib/supabase",()=>({supabase:{from:jest.fn(),rpc:jest.fn()}}));
test("profile loading reads identity fields without mixing organization permissions into authentication",async()=>{
 const data={id:"qa",first_name:"QA",last_name:"User",store:"Legacy label",must_change_password:true};
 const query={select:jest.fn().mockReturnThis(),eq:jest.fn().mockReturnThis(),single:jest.fn().mockResolvedValue({data,error:null})};
 supabase.from.mockReturnValue(query);
 await expect(getProfile("qa")).resolves.toEqual(data);
 expect(query.eq).toHaveBeenCalledWith("id","qa");expect(supabase.rpc).not.toHaveBeenCalled();
 expect(query.select).toHaveBeenCalledWith("id, first_name, last_name, store, must_change_password");
});

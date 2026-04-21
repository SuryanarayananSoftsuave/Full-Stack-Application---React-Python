import client from "./client";

const usersApi = {
  listUsers: async (params = {}) => {
    const response = await client.get("/users", { params });
    return response.data;
  },
};

export default usersApi;

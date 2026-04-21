import client from "./client";

const tasksApi = {
  listTasks: async (page = 1, pageSize = 50, filters = {}) => {
    const response = await client.get("/tasks", {
      params: { page, page_size: pageSize, ...filters },
    });
    return response.data;
  },

  getTask: async (taskId) => {
    const response = await client.get(`/tasks/${taskId}`);
    return response.data;
  },

  createTask: async (data) => {
    const response = await client.post("/tasks", data);
    return response.data;
  },

  updateTask: async (taskId, data) => {
    const response = await client.patch(`/tasks/${taskId}`, data);
    return response.data;
  },

  listSprints: async () => {
    const response = await client.get("/tasks/sprints/list");
    return response.data;
  },

  deleteTask: async (taskId) => {
    const response = await client.delete(`/tasks/${taskId}`);
    return response.data;
  },
};

export default tasksApi;

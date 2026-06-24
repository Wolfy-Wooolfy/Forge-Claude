const request = require('supertest');
const express = require('express');
const notesRouter = require('../src/NotesAPI');

const app = express();
app.use(express.json());
app.use('/api', notesRouter);

describe('Notes API', () => {
    test('should create a note', async () => {
        const response = await request(app)
            .post('/api/notes')
            .send({ title: 'Test Note', body: 'This is a test.', category: 'Test', tags: ['test', 'note'] });
        expect(response.statusCode).toBe(201);
        expect(response.body).toHaveProperty('title', 'Test Note');
    });

    test('should fetch all notes', async () => {
        const response = await request(app)
            .get('/api/notes');
        expect(response.statusCode).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
    });

    test('should fetch a note by id', async () => {
        const postResponse = await request(app)
            .post('/api/notes')
            .send({ title: 'Another Test Note' });
        const id = postResponse.body.id;

        const response = await request(app)
            .get(`/api/notes/${id}`);
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty('id', id);
    });

    test('should return 404 for non-existent note', async () => {
        const response = await request(app)
            .get('/api/notes/999');
        expect(response.statusCode).toBe(404);
    });

    test('should update a note by id', async () => {
        const postResponse = await request(app)
            .post('/api/notes')
            .send({ title: 'Update Test Note' });
        const id = postResponse.body.id;

        const updateResponse = await request(app)
            .put(`/api/notes/${id}`)
            .send({ title: 'Updated Title' });

        expect(updateResponse.statusCode).toBe(200);
        expect(updateResponse.body).toHaveProperty('title', 'Updated Title');
    });

    test('should delete a note by id', async () => {
        const postResponse = await request(app)
            .post('/api/notes')
            .send({ title: 'Delete Test Note' });
        const id = postResponse.body.id;

        const deleteResponse = await request(app)
            .delete(`/api/notes/${id}`);
        expect(deleteResponse.statusCode).toBe(204);
    });
});
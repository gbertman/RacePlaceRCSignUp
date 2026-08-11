import { Button, Paper, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router-dom';

function NotFoundPage() {
    return (
        <Paper className="not-found-page" withBorder shadow="md">
            <Stack align="center">
            <Text className="not-found-code">404</Text>
            <Title order={1} className="not-found-title">Page not found</Title>
            <Text className="not-found-copy">
                The page you requested does not exist or may have been moved.
            </Text>
            <Button component={Link} to="/">
                Return to Signup
            </Button>
            </Stack>
        </Paper>
    );
}

export default NotFoundPage;

import { Route, Routes } from 'react-router-dom';
import './App.css';
import Container from './layouts/container';
import OlMap from './components/map';
import Test from './views/Test';

// component: Application 컴포넌트 //
function App() {

  // render: Application 컴포넌트 랜더링  //
  return (
        <Routes>
          <Route element={<Container />}>
            <Route path="/test" element={<Test/>} />
            <Route path="*" element={<h1>404 Not Found</h1>} />
          </Route>
        </Routes>
  );
}

export default App;
